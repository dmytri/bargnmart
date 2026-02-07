import { getDb } from "../db/client";
import {
  generateId,
  hashToken,
  type AgentContext,
} from "../middleware/auth";
import { isValidUUID } from "../middleware/validation";

export async function handleMessages(
  req: Request,
  path: string,
  agentCtx: AgentContext | null
): Promise<Response> {
  const url = new URL(req.url);
  const segments = path.split("/").filter(Boolean);

  // GET /api/messages/product/:productId - get messages for a product
  if (segments[0] === "product" && segments[1]) {
    if (req.method === "GET") {
      return getProductMessages(segments[1], url, agentCtx);
    }
    return methodNotAllowed();
  }

  // POST /api/messages - send a message (human or agent)
  if (segments.length === 0 && req.method === "POST") {
    return sendMessage(req, agentCtx);
  }

  // GET /api/messages/poll - agent polls for new messages on their products
  if (segments[0] === "poll" && req.method === "GET") {
    if (!agentCtx) return unauthorized();
    return pollMessages(url, agentCtx);
  }

  return notFound();
}

async function getProductMessages(
  productId: string,
  url: URL,
  agentCtx: AgentContext | null
): Promise<Response> {
  if (!isValidUUID(productId)) {
    return notFound();
  }

  const db = getDb();

  // Verify product exists
  const productResult = await db.execute({
    sql: `SELECT id, agent_id FROM products WHERE id = ? AND hidden = 0`,
    args: [productId],
  });

  if (productResult.rows.length === 0) {
    return notFound();
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const since = url.searchParams.get("since");

  let sql = `SELECT m.id, m.product_id, m.sender_type, m.sender_id, m.text, m.created_at,
                    CASE WHEN m.sender_type = 'agent' THEN a.display_name ELSE NULL END as agent_name
             FROM messages m
             LEFT JOIN agents a ON m.sender_type = 'agent' AND m.sender_id = a.id
             WHERE m.product_id = ?`;
  const args: (string | number)[] = [productId];

  if (since) {
    sql += ` AND m.created_at > ?`;
    args.push(parseInt(since));
  }

  sql += ` ORDER BY m.created_at ASC LIMIT ?`;
  args.push(limit);

  const result = await db.execute({ sql, args });
  return json(result.rows);
}

async function sendMessage(
  req: Request,
  agentCtx: AgentContext | null
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { product_id, text, human_token } = body as {
    product_id?: string;
    text?: string;
    human_token?: string;
  };

  if (!product_id || !isValidUUID(product_id)) {
    return json({ error: "product_id required" }, 400);
  }

  if (!text || typeof text !== "string" || text.length === 0) {
    return json({ error: "text required" }, 400);
  }

  if (text.length > 2000) {
    return json({ error: "text must be 2000 characters or less" }, 400);
  }

  const db = getDb();

  // Verify product exists
  const productResult = await db.execute({
    sql: `SELECT id, agent_id FROM products WHERE id = ? AND hidden = 0`,
    args: [product_id],
  });

  if (productResult.rows.length === 0) {
    return json({ error: "Product not found" }, 404);
  }

  const product = productResult.rows[0];
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  // Determine sender
  let senderType: string;
  let senderId: string;

  if (agentCtx) {
    // Agent sending message - must own the product
    if (product.agent_id !== agentCtx.agent_id) {
      return json({ error: "Can only message on your own products" }, 403);
    }
    senderType = "agent";
    senderId = agentCtx.agent_id;
  } else if (human_token) {
    // Human with token
    const tokenHash = hashToken(human_token);
    const humanResult = await db.execute({
      sql: `SELECT id FROM humans WHERE token_hash = ?`,
      args: [tokenHash],
    });
    if (humanResult.rows.length === 0) {
      return json({ error: "Invalid token" }, 401);
    }
    senderType = "human";
    senderId = humanResult.rows[0].id as string;
  } else {
    // Anonymous human - create one
    const humanId = generateId();
    const anonId = generateId();
    await db.execute({
      sql: `INSERT INTO humans (id, anon_id, created_at) VALUES (?, ?, ?)`,
      args: [humanId, anonId, now],
    });
    senderType = "human";
    senderId = humanId;
  }

  await db.execute({
    sql: `INSERT INTO messages (id, product_id, sender_type, sender_id, text, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, product_id, senderType, senderId, text, now],
  });

  return json({ id, product_id, sender_type: senderType }, 201);
}

async function pollMessages(
  url: URL,
  agentCtx: AgentContext
): Promise<Response> {
  const db = getDb();
  const since = url.searchParams.get("since") || "0";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  // Get messages on agent's products from humans
  const result = await db.execute({
    sql: `SELECT m.id, m.product_id, m.sender_type, m.sender_id, m.text, m.created_at,
                 p.title as product_title
          FROM messages m
          JOIN products p ON m.product_id = p.id
          WHERE p.agent_id = ? AND m.sender_type = 'human' AND m.created_at > ?
          ORDER BY m.created_at ASC
          LIMIT ?`,
    args: [agentCtx.agent_id, parseInt(since), limit],
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

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
