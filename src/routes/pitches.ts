import { getDb } from "../db/client";
import { generateId, type AgentContext } from "../middleware/auth";
import { validatePitchInput, isValidUUID } from "../middleware/validation";

export async function handlePitches(
  req: Request,
  path: string,
  agentCtx: AgentContext | null
): Promise<Response> {
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    if (req.method === "POST") {
      if (!agentCtx) return unauthorized();
      return createPitch(req, agentCtx);
    }
    return methodNotAllowed();
  }

  if (segments[0] === "mine") {
    if (!agentCtx) return unauthorized();
    if (req.method === "GET") {
      const url = new URL(req.url);
      return listMyPitches(url, agentCtx);
    }
    return methodNotAllowed();
  }

  return notFound();
}

async function createPitch(
  req: Request,
  agentCtx: AgentContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const errors = validatePitchInput(body as Record<string, unknown>);
  if (errors.length > 0) {
    return json({ errors }, 400);
  }

  const { request_id, product_id, pitch_text } = body as {
    request_id: string;
    product_id: string;
    pitch_text: string;
  };

  // product_id is required
  if (!product_id || !isValidUUID(product_id)) {
    return json({ error: "product_id is required" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Verify request exists and is open
  const requestResult = await db.execute({
    sql: `SELECT id, human_id, requester_type, requester_id, status FROM requests WHERE id = ? AND hidden = 0`,
    args: [request_id],
  });

  if (requestResult.rows.length === 0) {
    return json({ error: "Request not found" }, 404);
  }

  const request = requestResult.rows[0];
  if (request.status !== "open") {
    return json({ error: "Request is not open" }, 400);
  }

  // Prevent agent from pitching to their own request
  if (request.requester_type === "agent" && request.requester_id === agentCtx.agent_id) {
    return json({ error: "Cannot pitch to your own request. That's just talking to yourself." }, 403);
  }

  // Rate limit: Agent-to-agent pitching limited to 1 per 10 minutes
  if (request.requester_type === "agent") {
    const tenMinutesAgo = now - 600;
    const recentAgentPitches = await db.execute({
      sql: `SELECT COUNT(*) as count FROM pitches p
            JOIN requests r ON p.request_id = r.id
            WHERE p.agent_id = ? AND r.requester_type = 'agent' AND p.created_at > ?`,
      args: [agentCtx.agent_id, tenMinutesAgo],
    });
    
    if ((recentAgentPitches.rows[0].count as number) >= 1) {
      return json({ 
        error: "Rate limited",
        message: "Agent-to-agent pitching limited to once per 10 minutes. Inter-robot diplomacy takes time.",
      }, 429);
    }
  }

  // Check if agent is blocked by the requester (only for human requesters)
  if (request.requester_type === "human") {
    const blockCheck = await db.execute({
      sql: `SELECT 1 FROM blocks
            WHERE blocker_type = 'human' AND blocker_id = ?
            AND blocked_type = 'agent' AND blocked_id = ?`,
      args: [request.human_id, agentCtx.agent_id],
    });

    if (blockCheck.rows.length > 0) {
      return forbidden();
    }
  }

  // Verify product exists and belongs to this agent
  const productCheck = await db.execute({
    sql: `SELECT agent_id FROM products WHERE id = ? AND hidden = 0`,
    args: [product_id],
  });

  if (productCheck.rows.length === 0) {
    return json({ error: "Product not found" }, 404);
  }

  if (productCheck.rows[0].agent_id !== agentCtx.agent_id) {
    return forbidden();
  }

  const id = generateId();

  await db.execute({
    sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, request_id, agentCtx.agent_id, product_id, pitch_text, now],
  });

  return json({ id, request_id }, 201);
}

async function listMyPitches(url: URL, agentCtx: AgentContext): Promise<Response> {
  const db = getDb();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const result = await db.execute({
    sql: `SELECT p.id, p.request_id, p.product_id, p.pitch_text, p.created_at,
                 r.text as request_text, r.status as request_status
          FROM pitches p
          JOIN requests r ON p.request_id = r.id
          WHERE p.agent_id = ? AND p.hidden = 0
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?`,
    args: [agentCtx.agent_id, limit, offset],
  });

  return json(result.rows);
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

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function forbidden(): Response {
  return new Response(null, { status: 403 });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
