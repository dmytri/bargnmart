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
      if (!humanCtx) return unauthorized("Login required to create requests");
      return createRequest(req, humanCtx);
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
    if (action === "rate") return rateAgent(req, requestId);
    if (action === "star") return starAgent(req, requestId);
    if (action === "block") return blockAgent(req, requestId);
  }

  return notFound();
}

async function listRequests(url: URL): Promise<Response> {
  const db = getDb();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const result = await db.execute({
    sql: `SELECT r.id, r.human_id, r.text, r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.status, r.created_at,
                 (SELECT COUNT(*) FROM pitches p WHERE p.request_id = r.id AND p.hidden = 0) as pitch_count
          FROM requests r
          WHERE r.status = 'open' AND r.hidden = 0
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });

  return json(result.rows);
}

async function getRequest(requestId: string): Promise<Response> {
  const db = getDb();

  const requestResult = await db.execute({
    sql: `SELECT id, human_id, text, budget_min_cents, budget_max_cents, currency, tags, status, created_at
          FROM requests WHERE id = ? AND hidden = 0`,
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

async function createRequest(req: Request, humanCtx: HumanContext): Promise<Response> {
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

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const requestId = generateId();
  const deleteToken = generateToken();
  const deleteTokenHash = hashToken(deleteToken);

  await db.execute({
    sql: `INSERT INTO requests (id, human_id, delete_token_hash, text, budget_min_cents, budget_max_cents, currency, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      requestId,
      humanCtx.human_id,
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

  return json({ id: requestId, delete_token: deleteToken }, 201);
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

  // Only return requests created after agent's last poll
  // Also exclude requests the agent has already pitched on
  let sql = `SELECT r.id, r.human_id, r.text, r.budget_min_cents, r.budget_max_cents, r.currency, r.tags, r.created_at
             FROM requests r
             WHERE r.status = 'open' AND r.hidden = 0
             AND r.created_at > ?
             AND NOT EXISTS (
               SELECT 1 FROM blocks b
               WHERE b.blocker_type = 'human' AND b.blocker_id = r.human_id
               AND b.blocked_type = 'agent' AND b.blocked_id = ?
             )
             AND NOT EXISTS (
               SELECT 1 FROM pitches p
               WHERE p.request_id = r.id AND p.agent_id = ?
             )`;
  const args: (string | number)[] = [agentCtx.last_poll_at, agentCtx.agent_id, agentCtx.agent_id];

  if (minBudget) {
    sql += ` AND r.budget_max_cents >= ?`;
    args.push(parseInt(minBudget));
  }

  if (maxBudget) {
    sql += ` AND r.budget_min_cents <= ?`;
    args.push(parseInt(maxBudget));
  }

  sql += ` ORDER BY r.created_at ASC LIMIT ?`;
  args.push(limit);

  const result = await db.execute({ sql, args });

  // Update agent's last_poll_at timestamp
  await db.execute({
    sql: `UPDATE agents SET last_poll_at = ? WHERE id = ?`,
    args: [now, agentCtx.agent_id],
  });

  return json(result.rows);
}

async function rateAgent(req: Request, requestId: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorized();

  const valid = await verifyDeleteToken(requestId, token);
  if (!valid) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { agent_id, score } = body as { agent_id?: string; score?: number };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  if (!score || score < 1 || score > 5) {
    return json({ error: "score must be 1-5" }, 400);
  }

  const db = getDb();
  const requestResult = await db.execute({
    sql: `SELECT human_id FROM requests WHERE id = ?`,
    args: [requestId],
  });
  if (requestResult.rows.length === 0) return notFound();

  const humanId = requestResult.rows[0].human_id as string;
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, created_at)
          VALUES (?, 'human', ?, 'agent', ?, ?, ?)
          ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE SET
            score = excluded.score, created_at = excluded.created_at`,
    args: [id, humanId, agent_id, score, now],
  });

  return json({ success: true });
}

async function starAgent(req: Request, requestId: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorized();

  const valid = await verifyDeleteToken(requestId, token);
  if (!valid) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { agent_id } = body as { agent_id?: string };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  const db = getDb();
  const requestResult = await db.execute({
    sql: `SELECT human_id FROM requests WHERE id = ?`,
    args: [requestId],
  });
  if (requestResult.rows.length === 0) return notFound();

  const humanId = requestResult.rows[0].human_id as string;
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, category, created_at)
          VALUES (?, 'human', ?, 'agent', ?, 'star', ?)
          ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE SET
            category = 'star', created_at = excluded.created_at`,
    args: [id, humanId, agent_id, now],
  });

  return json({ success: true });
}

async function blockAgent(req: Request, requestId: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return unauthorized();

  const valid = await verifyDeleteToken(requestId, token);
  if (!valid) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { agent_id, reason } = body as { agent_id?: string; reason?: string };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  const db = getDb();
  const requestResult = await db.execute({
    sql: `SELECT human_id FROM requests WHERE id = ?`,
    args: [requestId],
  });
  if (requestResult.rows.length === 0) return notFound();

  const humanId = requestResult.rows[0].human_id as string;
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO blocks (id, blocker_type, blocker_id, blocked_type, blocked_id, reason, created_at)
          VALUES (?, 'human', ?, 'agent', ?, ?, ?)
          ON CONFLICT(blocker_type, blocker_id, blocked_type, blocked_id) DO NOTHING`,
    args: [id, humanId, agent_id, reason || null, now],
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
