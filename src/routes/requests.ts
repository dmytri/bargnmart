import { getDb } from "../db/client";
import {
  generateId,
  generateToken,
  hashToken,
  verifyDeleteToken,
  type AgentContext,
  type HumanContext,
} from "../middleware/auth";
import { validateRequestInput, isValidUUID } from "../middleware/validation";
import { postRequest } from "../lib/social-poster";

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      const num = Number(value);
      result[key] = Number.isSafeInteger(num) ? num : String(value);
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else if (value !== null && typeof value === "object") {
      result[key] = sanitizeRow(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(row => sanitizeRow(row) as T);
}

export async function handleRequests(
  req: Request,
  path: string,
  agentCtx: AgentContext | null,
  humanCtx: HumanContext | null
): Promise<Response> {
  const url = new URL(req.url);
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    if (req.method === "GET") return listRequests(url);
    if (req.method === "POST") {
      // Both humans and agents can create requests
      if (!humanCtx && !agentCtx) return unauthorized("Login required to create requests");
      return createRequest(req, humanCtx, agentCtx);
    }
    return methodNotAllowed();
  }

  if (segments[0] === "poll" && req.method === "GET") {
    if (!agentCtx) return unauthorized();
    return pollRequests(url, agentCtx);
  }

  if (segments[0] === "mine" && req.method === "GET") {
    if (!agentCtx) return unauthorized();
    return getMyRequests(url, agentCtx);
  }

  const requestId = segments[0];
  if (!isValidUUID(requestId)) {
    return notFound();
  }

  if (segments.length === 1) {
    if (req.method === "GET") return getRequest(requestId, humanCtx);
    if (req.method === "PATCH") return updateRequest(req, requestId);
    if (req.method === "DELETE") return deleteRequest(req, requestId);
    return methodNotAllowed();
  }

  const action = segments[1];
  if (req.method === "POST") {
    if (action === "rate") return rateAgent(req, requestId, humanCtx);
    if (action === "star") return starAgent(req, requestId, humanCtx);
    if (action === "block") return blockAgent(req, requestId, humanCtx);
  }

  return notFound();
}

async function listRequests(url: URL): Promise<Response> {
  const db = getDb();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const cursor = url.searchParams.get("cursor");
  const requesterId = url.searchParams.get("requester_id");

  // Use JOINs instead of correlated subqueries for better performance and stability
  let sql = `SELECT r.id, r.human_id, r.requester_type, r.requester_id, r.text, 
                 r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.status, r.created_at,
                 COALESCE(p.pitch_count, 0) as pitch_count,
                 COALESCE(h.display_name, a.display_name, r.requester_id) as requester_name
          FROM requests r
          LEFT JOIN (
            SELECT request_id, COUNT(*) as pitch_count 
            FROM pitches WHERE hidden = 0 GROUP BY request_id
          ) p ON r.id = p.request_id
          LEFT JOIN humans h ON r.requester_type = 'human' AND h.id = r.requester_id
          LEFT JOIN agents a ON r.requester_type = 'agent' AND a.id = r.requester_id
          WHERE r.status = 'open' AND r.hidden = 0`;
  const args: (string | number)[] = [];

  if (requesterId) {
    sql += ` AND r.requester_id = ?`;
    args.push(requesterId);
  }

  // Cursor-based pagination
  if (cursor) {
    const cursorTs = parseInt(cursor);
    if (!isNaN(cursorTs)) {
      sql += ` AND r.created_at < ?`;
      args.push(cursorTs);
    }
  }

  sql += ` ORDER BY r.created_at DESC LIMIT ?`;
  args.push(limit + 1);

  let result;
  try {
    result = await db.execute({ sql, args });
  } catch (err) {
    console.error("listRequests query failed:", err);
    return json({ error: "Failed to fetch requests" }, 500);
  }

  const safeRows = sanitizeRows(result.rows as Record<string, unknown>[]);
  const hasMore = safeRows.length > limit;
  const rows = hasMore ? safeRows.slice(0, limit) : safeRows;
  
  if (cursor) {
    const nextCursor = hasMore && rows.length > 0 
      ? String(rows[rows.length - 1].created_at) 
      : null;
    return json({
      data: rows,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  }

  // Default: return array for backward compatibility
  return json(rows);
}

async function getRequest(requestId: string, humanCtx: HumanContext | null): Promise<Response> {
  const db = getDb();

  // Get last_seen_notifications for logged-in humans
  let lastSeenNotifications: number | null = null;
  if (humanCtx) {
    const lastSeenResult = await db.execute({
      sql: `SELECT last_seen_notifications FROM humans WHERE id = ?`,
      args: [humanCtx.human_id],
    });
    lastSeenNotifications = lastSeenResult.rows[0]?.last_seen_notifications as number | null;
  }

  const requestResult = await db.execute({
    sql: `SELECT r.id, r.human_id, r.requester_type, r.requester_id, r.text, 
                 r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.status, r.created_at,
                 CASE 
                   WHEN r.requester_type = 'human' THEN (SELECT display_name FROM humans WHERE id = r.requester_id)
                   WHEN r.requester_type = 'agent' THEN (SELECT display_name FROM agents WHERE id = r.requester_id)
                 END as requester_name
          FROM requests r WHERE r.id = ? AND r.hidden = 0`,
    args: [requestId],
  });

  if (requestResult.rows.length === 0) return notFound();

  const pitchesResult = await db.execute({
    sql: `SELECT p.id, p.agent_id, p.product_id, p.pitch_text, p.created_at, p.human_last_seen_at,
                 a.display_name as agent_name,
                 pr.title as product_title, pr.price_cents as product_price_cents,
                 pr.description as product_description
          FROM pitches p
          JOIN agents a ON p.agent_id = a.id
          LEFT JOIN products pr ON p.product_id = pr.id
          WHERE p.request_id = ? AND p.hidden = 0
          ORDER BY p.created_at DESC`,
    args: [requestId],
  });

  return json({
    ...requestResult.rows[0],
    pitches: pitchesResult.rows,
    last_seen_notifications: lastSeenNotifications,
  });
}

async function getMyRequests(
  url: URL,
  agentCtx: AgentContext
): Promise<Response> {
  const db = getDb();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 50);
  
  // Get requests posted by this agent (where they are the buyer)
  const result = await db.execute({
    sql: `SELECT r.id, r.text, r.budget_min_cents, r.budget_max_cents, 
                 r.status, r.created_at,
                 (SELECT COUNT(*) FROM pitches p WHERE p.request_id = r.id AND p.hidden = 0) as pitch_count
          FROM requests r
          WHERE r.requester_type = 'agent' 
            AND r.requester_id = ?
            AND r.status = 'open'
            AND r.hidden = 0
          ORDER BY r.created_at DESC
          LIMIT ?`,
    args: [agentCtx.agent_id, limit],
  });

  return json(result.rows);
}

async function createRequest(
  req: Request, 
  humanCtx: HumanContext | null,
  agentCtx: AgentContext | null
): Promise<Response> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  
  let requesterType: 'human' | 'agent';
  let requesterId: string;
  let deleteToken: string | null = null;
  let deleteTokenHash: string | null = null;
  
  if (humanCtx) {
    // Human creating request
    requesterType = 'human';
    requesterId = humanCtx.human_id;
    
    // Check human status - must be 'active'
    const humanResult = await db.execute({
      sql: `SELECT status FROM humans WHERE id = ?`,
      args: [humanCtx.human_id],
    });
    
    if (humanResult.rows.length === 0) {
      return json({ error: "Human not found" }, 404);
    }
    
    const status = humanResult.rows[0].status as string | null;
    
    // Only 'active' status can post - block everything else
    if (status !== "active") {
      if (status === "pending") {
        return json({ 
          error: "Account not activated",
          message: "Complete social verification to post requests",
          profile_url: `/user/${humanCtx.human_id}`,
          activate_url: `/user/${humanCtx.human_id}#claim`,
        }, 403);
      }
      
      if (status === "legacy" || !status) {
        return json({ 
          error: "Legacy account",
          message: "Re-register with social verification to post new requests",
          register_url: `/register`,
        }, 403);
      }
      
      if (status === "suspended") {
        return json({ error: "Account is suspended" }, 403);
      }
      
      if (status === "banned") {
        return json({ error: "Account has been banned" }, 403);
      }
      
      // Catch-all for any unknown status
      return json({ error: "Account status invalid" }, 403);
    }
    
    // Humans get delete tokens
    deleteToken = generateToken();
    deleteTokenHash = hashToken(deleteToken);
    
  } else if (agentCtx) {
    // Agent creating request
    requesterType = 'agent';
    requesterId = agentCtx.agent_id;
    
    // Check agent status - must be 'active'
    const agentResult = await db.execute({
      sql: `SELECT status FROM agents WHERE id = ?`,
      args: [agentCtx.agent_id],
    });
    
    if (agentResult.rows.length === 0) {
      return json({ error: "Agent not found" }, 404);
    }
    
    const status = agentResult.rows[0].status as string | null;
    if (status !== "active") {
      if (status === "pending") {
        return json({ 
          error: "Agent not activated",
          message: "Complete social verification first",
          profile_url: `/agent/${agentCtx.agent_id}`,
        }, 403);
      }
      return json({ error: "Agent account not active" }, 403);
    }
    
    // Rate limit: Agents can only post 1 request per hour
    const oneHourAgo = now - 3600;
    const recentRequests = await db.execute({
      sql: `SELECT COUNT(*) as count FROM requests 
            WHERE requester_type = 'agent' AND requester_id = ? AND created_at > ?`,
      args: [agentCtx.agent_id, oneHourAgo],
    });
    
    if ((recentRequests.rows[0].count as number) >= 1) {
      return json({ 
        error: "Rate limited",
        message: "Agents can only post 1 request per hour. Even robots must practice patience.",
      }, 429);
    }
    
    // Agents don't get delete tokens - they manage via their own auth
  } else {
    return json({ error: "Authentication required" }, 401);
  }
  
  const body = await req.json().catch(() => ({}));
  const errors = validateRequestInput(body as Record<string, unknown>);
  if (errors.length > 0) {
    return json({ errors }, 400);
  }

  const {
    text,
    budget_min_cents,
    budget_max_cents,
    currency,
    tags,
  } = body as {
    text: string;
    budget_min_cents?: number;
    budget_max_cents?: number;
    currency?: string;
    tags?: string;
  };

  const requestId = generateId();

  await db.execute({
    sql: `INSERT INTO requests (id, human_id, requester_type, requester_id, delete_token_hash, text, budget_min_cents, budget_max_cents, currency, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      requestId,
      requesterType === 'human' ? requesterId : null,
      requesterType,
      requesterId,
      deleteTokenHash,
      text,
      budget_min_cents ?? null,
      budget_max_cents ?? null,
      currency || "USD",
      tags || null,
      now,
      now,
    ],
  });

  // Post to social platform if human requester (fire-and-forget)
  if (humanCtx) {
    const humanResult = await db.execute({
      sql: `SELECT claimed_proof_url FROM humans WHERE id = ?`,
      args: [humanCtx.human_id],
    });
    const proofUrl = humanResult.rows[0]?.claimed_proof_url as string | null;
    if (proofUrl) {
      postRequest(proofUrl, text, budget_min_cents ?? null, budget_max_cents ?? null, requestId).catch(() => {});
    }
  }

  const response: { id: string; delete_token?: string } = { id: requestId };
  if (deleteToken) {
    response.delete_token = deleteToken;
  }
  
  return json(response, 201);
}

async function updateRequest(
  req: Request,
  requestId: string
): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorized();

  const valid = await verifyDeleteToken(requestId, token);
  if (!valid) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { status } = body as { status?: string };

  if (!status || !["muted", "resolved"].includes(status)) {
    return json({ error: "status must be 'muted' or 'resolved'" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `UPDATE requests SET status = ?, updated_at = ? WHERE id = ?`,
    args: [status, now, requestId],
  });

  return json({ success: true });
}

async function deleteRequest(
  req: Request,
  requestId: string
): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorized();

  const valid = await verifyDeleteToken(requestId, token);
  if (!valid) return unauthorized();

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `UPDATE requests SET status = 'deleted', updated_at = ? WHERE id = ?`,
    args: [now, requestId],
  });

  return json({ success: true });
}

async function pollRequests(
  url: URL,
  agentCtx: AgentContext
): Promise<Response> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const minBudget = url.searchParams.get("min_budget");
  const maxBudget = url.searchParams.get("max_budget");

  const sql = `SELECT r.id, r.human_id, r.requester_type, r.requester_id, r.text, 
                    r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.created_at,
                    COALESCE(h.display_name, a.display_name, r.requester_id) as requester_name
             FROM requests r
             LEFT JOIN humans h ON r.requester_type = 'human' AND h.id = r.requester_id
             LEFT JOIN agents a ON r.requester_type = 'agent' AND a.id = r.requester_id
             WHERE r.status = 'open' AND r.hidden = 0
             AND NOT (r.requester_type = 'agent' AND r.requester_id = ?)
             AND NOT EXISTS (
               SELECT 1 FROM blocks b
               WHERE b.blocker_type = 'human' AND b.blocker_id = r.human_id
               AND b.blocked_type = 'agent' AND b.blocked_id = ?
             )
             AND NOT EXISTS (
               SELECT 1 FROM pitches p
               WHERE p.request_id = r.id AND p.agent_id = ?
             )`;
  const args: (string | number)[] = [agentCtx.agent_id, agentCtx.agent_id, agentCtx.agent_id];

  if (minBudget) {
    args.push(parseInt(minBudget));
  }

  if (maxBudget) {
    args.push(parseInt(maxBudget));
  }

  let fullSql = sql;
  if (minBudget) {
    fullSql += ` AND r.budget_max_cents >= ?`;
  }
  if (maxBudget) {
    fullSql += ` AND r.budget_min_cents <= ?`;
  }
  fullSql += ` ORDER BY r.created_at DESC LIMIT ?`;
  args.push(limit);

  let result;
  try {
    result = await db.execute({ sql: fullSql, args });
  } catch (err) {
    console.error("pollRequests query failed:", err);
    return json({ error: "Failed to fetch requests" }, 500);
  }

  const safeRows = sanitizeRows(result.rows as Record<string, unknown>[]);
  const requestIds = safeRows.map((r) => r.id as string);

  let requestsWithPitches: any[];
  if (requestIds.length > 0) {
    const placeholders = requestIds.map(() => "?").join(",");
    const pitchesResult = await db.execute({
      sql: `SELECT p.id, p.agent_id, p.product_id, p.pitch_text, p.created_at,
                   p.request_id,
                   a.display_name as agent_name,
                   pr.title as product_title, pr.price_cents as product_price_cents,
                   pr.description as product_description
            FROM pitches p
            JOIN agents a ON p.agent_id = a.id
            LEFT JOIN products pr ON p.product_id = pr.id
            WHERE p.request_id IN (${placeholders}) AND p.hidden = 0
            ORDER BY p.request_id, p.created_at DESC`,
      args: requestIds as (string | number)[],
    });

    const safePitches = sanitizeRows(pitchesResult.rows as Record<string, unknown>[]);
    const pitchesByRequest = new Map<string, any[]>();
    for (const pitch of safePitches) {
      const reqId = pitch.request_id as string;
      if (!pitchesByRequest.has(reqId)) {
        pitchesByRequest.set(reqId, []);
      }
      pitchesByRequest.get(reqId)!.push(pitch);
    }

    requestsWithPitches = safeRows.map((request: any) => ({
      ...request,
      pitches: pitchesByRequest.get(request.id as string) || [],
      pitch_count: pitchesByRequest.get(request.id as string)?.length || 0,
    }));
  } else {
    requestsWithPitches = safeRows.map((request: any) => ({
      ...request,
      pitches: [],
      pitch_count: 0,
    }));
  }

  await db.execute({
    sql: `UPDATE agents SET last_poll_at = ? WHERE id = ?`,
    args: [now, agentCtx.agent_id],
  });

  return json(requestsWithPitches);
}

async function rateAgent(req: Request, requestId: string, humanCtx: HumanContext | null): Promise<Response> {
  if (!humanCtx) return unauthorized("Login required to rate agents");

  const body = await req.json().catch(() => ({}));
  const { agent_id, score } = body as { agent_id?: string; score?: number };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  if (!score || score < 1 || score > 5) {
    return json({ error: "score must be 1-5" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, created_at)
          VALUES (?, 'human', ?, 'agent', ?, ?, ?)
          ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE SET
            score = excluded.score, created_at = excluded.created_at`,
    args: [id, humanCtx.human_id, agent_id, score, now],
  });

  return json({ success: true });
}

async function starAgent(req: Request, requestId: string, humanCtx: HumanContext | null): Promise<Response> {
  if (!humanCtx) return unauthorized("Login required to star agents");

  const body = await req.json().catch(() => ({}));
  const { agent_id } = body as { agent_id?: string };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, category, created_at)
          VALUES (?, 'human', ?, 'agent', ?, 'star', ?)
          ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE SET
            category = 'star', created_at = excluded.created_at`,
    args: [id, humanCtx.human_id, agent_id, now],
  });

  return json({ success: true });
}

async function blockAgent(req: Request, requestId: string, humanCtx: HumanContext | null): Promise<Response> {
  if (!humanCtx) return unauthorized("Login required to block agents");

  const body = await req.json().catch(() => ({}));
  const { agent_id, reason } = body as { agent_id?: string; reason?: string };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  if (reason && reason.length > 500) {
    return json({ error: "reason too long (max 500 chars)" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO blocks (id, blocker_type, blocker_id, blocked_type, blocked_id, reason, created_at)
          VALUES (?, 'human', ?, 'agent', ?, ?, ?)
          ON CONFLICT(blocker_type, blocker_id, blocked_type, blocked_id) DO NOTHING`,
    args: [id, humanCtx.human_id, agent_id, reason || null, now],
  });

  return json({ success: true });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, (_key, value) => {
    if (typeof value === "bigint") {
      if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(value);
      }
      return value.toString();
    }
    return value;
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(message = "Unauthorized"): Response {
  return json({ error: message }, 401);
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
