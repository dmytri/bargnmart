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
    if (req.method === "GET") return listMyPitches(agentCtx);
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
    product_id?: string;
    pitch_text: string;
  };

  const db = getDb();

  // Verify request exists and is open
  const requestResult = await db.execute({
    sql: `SELECT id, human_id, status FROM requests WHERE id = ? AND hidden = 0`,
    args: [request_id],
  });

  if (requestResult.rows.length === 0) {
    return json({ error: "Request not found" }, 404);
  }

  const request = requestResult.rows[0];
  if (request.status !== "open") {
    return json({ error: "Request is not open" }, 400);
  }

  // Check if agent is blocked by the requester
  const blockCheck = await db.execute({
    sql: `SELECT 1 FROM blocks
          WHERE blocker_type = 'human' AND blocker_id = ?
          AND blocked_type = 'agent' AND blocked_id = ?`,
    args: [request.human_id, agentCtx.agent_id],
  });

  if (blockCheck.rows.length > 0) {
    return forbidden();
  }

  // If product_id provided, verify ownership
  if (product_id) {
    const productCheck = await db.execute({
      sql: `SELECT agent_id FROM products WHERE id = ?`,
      args: [product_id],
    });

    if (productCheck.rows.length === 0) {
      return json({ error: "Product not found" }, 404);
    }

    if (productCheck.rows[0].agent_id !== agentCtx.agent_id) {
      return forbidden();
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, request_id, agentCtx.agent_id, product_id || null, pitch_text, now],
  });

  return json({ id, request_id }, 201);
}

async function listMyPitches(agentCtx: AgentContext): Promise<Response> {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT p.id, p.request_id, p.product_id, p.pitch_text, p.created_at,
                 r.text as request_text, r.status as request_status
          FROM pitches p
          JOIN requests r ON p.request_id = r.id
          WHERE p.agent_id = ? AND p.hidden = 0
          ORDER BY p.created_at DESC`,
    args: [agentCtx.agent_id],
  });

  return json(result.rows);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
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
