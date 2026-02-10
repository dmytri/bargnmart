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

  const requestId = segments[0];
  if (!isValidUUID(requestId)) {
    return notFound();
  }

  if (segments.length === 1) {
    if (req.method === "GET") return getRequest(requestId);
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
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const requesterId = url.searchParams.get("requester_id");

  let sql = `SELECT r.id, r.human_id, r.requester_type, r.requester_id, r.text, 
                 r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.status, r.created_at,
                 (SELECT COUNT(*) FROM pitches p WHERE p.request_id = r.id AND p.hidden = 0) as pitch_count,
                 CASE 
                   WHEN r.requester_type = 'human' THEN (SELECT display_name FROM humans WHERE id = r.requester_id)
                   WHEN r.requester_type = 'agent' THEN (SELECT display_name FROM agents WHERE id = r.requester_id)
                 END as requester_name
          FROM requests r
          WHERE r.status = 'open' AND r.hidden = 0`;
  const args: (string | number)[] = [];

  if (requesterId) {
    sql += ` AND r.requester_id = ?`;
    args.push(requesterId);
  }

  sql += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const result = await db.execute({ sql, args });

  return json(result.rows);
}

async function getRequest(requestId: string): Promise<Response> {
  const db = getDb();

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
    sql: `SELECT p.id, p.agent_id, p.product_id, p.pitch_text, p.created_at,
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
  });
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

  // Return requests created after agent's last poll
  // Exclude: agent's own requests, already pitched, blocked by human requester
  let sql = `SELECT r.id, r.human_id, r.requester_type, r.requester_id, r.text, 
                    r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.created_at,
                    CASE 
                      WHEN r.requester_type = 'human' THEN (SELECT display_name FROM humans WHERE id = r.requester_id)
                      WHEN r.requester_type = 'agent' THEN (SELECT display_name FROM agents WHERE id = r.requester_id)
                    END as requester_name
             FROM requests r
             WHERE r.status = 'open' AND r.hidden = 0
             AND r.created_at > ?
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
  const args: (string | number)[] = [agentCtx.last_poll_at, agentCtx.agent_id, agentCtx.agent_id, agentCtx.agent_id];

  if (minBudget) {
    sql += ` AND r.budget_max_cents >= ?`;
    args.push(parseInt(minBudget));
  }

  if (maxBudget) {
    sql += ` AND r.budget_min_cents <= ?`;
    args.push(parseInt(maxBudget));
  }

  sql += ` ORDER BY r.created_at DESC LIMIT ?`;
  args.push(limit);

  const result = await db.execute({ sql, args });

  // Fetch pitches for each request (for competitive intelligence)
  const requestIds = result.rows.map((r: any) => r.id);
  const requestsWithPitches = await Promise.all(
    result.rows.map(async (request: any) => {
      const pitchesResult = await db.execute({
        sql: `SELECT p.id, p.agent_id, p.product_id, p.pitch_text, p.created_at,
                     a.display_name as agent_name,
                     pr.title as product_title, pr.price_cents as product_price_cents,
                     pr.description as product_description
              FROM pitches p
              JOIN agents a ON p.agent_id = a.id
              LEFT JOIN products pr ON p.product_id = pr.id
              WHERE p.request_id = ? AND p.hidden = 0
              ORDER BY p.created_at DESC
              LIMIT 10`,
        args: [request.id],
      });
      return {
        ...request,
        pitches: pitchesResult.rows,
        pitch_count: pitchesResult.rows.length,
      };
    })
  );

  // Update agent's last_poll_at timestamp
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
  return new Response(JSON.stringify(data), {
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
