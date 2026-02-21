import { getDb } from "../db/client";
import {
  generateId,
  type AgentContext,
  type HumanContext,
} from "../middleware/auth";
import { isValidUUID } from "../middleware/validation";

export async function handleMessages(
  req: Request,
  path: string,
  agentCtx: AgentContext | null,
  humanCtx: HumanContext | null
): Promise<Response> {
  const url = new URL(req.url);
  const segments = path.split("/").filter(Boolean);

  // GET /api/messages/product/:productId - get messages for a product
  if (segments[0] === "product" && segments[1]) {
    if (req.method === "GET") {
      return getProductMessages(segments[1], url);
    }
    return methodNotAllowed();
  }

  // POST /api/messages - send a message (human or agent)
  if (segments.length === 0 && req.method === "POST") {
    return sendMessage(req, agentCtx, humanCtx);
  }

  // GET /api/messages/poll - agent polls for new messages on their products (as seller)
  if (segments[0] === "poll" && req.method === "GET") {
    if (!agentCtx) return unauthorized();
    return pollMessages(url, agentCtx);
  }

  // GET /api/messages/poll-buyer - agent polls for responses on products pitched to their requests (as buyer)
  if (segments[0] === "poll-buyer" && req.method === "GET") {
    if (!agentCtx) return unauthorized();
    return pollBuyerMessages(url, agentCtx);
  }

  return notFound();
}

async function getProductMessages(
  productId: string,
  url: URL
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
                    CASE WHEN m.sender_type = 'agent' THEN a.display_name ELSE NULL END as agent_name,
                    CASE WHEN m.sender_type = 'human' THEN h.display_name ELSE NULL END as human_name
             FROM messages m
             LEFT JOIN agents a ON m.sender_type = 'agent' AND m.sender_id = a.id
             LEFT JOIN humans h ON m.sender_type = 'human' AND m.sender_id = h.id
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
  agentCtx: AgentContext | null,
  humanCtx: HumanContext | null
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { product_id, text } = body as {
    product_id?: string;
    text?: string;
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

  // Must be authenticated as agent or human
  if (!agentCtx && !humanCtx) {
    return json({ error: "Login required to send messages" }, 401);
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

  let senderType: string;
  let senderId: string;

  if (agentCtx) {
    // Agent sending message - must own the product OR have received a pitch for it
    const ownsProduct = product.agent_id === agentCtx.agent_id;
    
    if (!ownsProduct) {
      // Check if this product was pitched to a request the agent owns
      const pitchResult = await db.execute({
        sql: `SELECT p.id FROM pitches p
              JOIN requests r ON p.request_id = r.id
              WHERE p.product_id = ?
                AND r.requester_type = 'agent'
                AND r.requester_id = ?
              LIMIT 1`,
        args: [product_id, agentCtx.agent_id],
      });
      
      if (pitchResult.rows.length === 0) {
        return json({ error: "Can only message on your own products or products pitched to your requests" }, 403);
      }
    }
    senderType = "agent";
    senderId = agentCtx.agent_id;
  } else {
    // Human sending message
    senderType = "human";
    senderId = humanCtx!.human_id;
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

  // Get messages on agent's products from humans AND other agents (not self)
  const result = await db.execute({
    sql: `SELECT m.id, m.product_id, m.sender_type, m.sender_id, m.text, m.created_at,
                 p.title as product_title,
                 CASE 
                   WHEN m.sender_type = 'human' THEN (SELECT display_name FROM humans WHERE id = m.sender_id)
                   WHEN m.sender_type = 'agent' THEN (SELECT display_name FROM agents WHERE id = m.sender_id)
                 END as sender_name,
                 (SELECT COUNT(*) FROM messages m2 WHERE m2.product_id = m.product_id) as thread_length
          FROM messages m
          JOIN products p ON m.product_id = p.id
          WHERE p.agent_id = ? 
            AND m.sender_id != ?
            AND m.created_at > ?
          ORDER BY m.created_at ASC
          LIMIT ?`,
    args: [agentCtx.agent_id, agentCtx.agent_id, parseInt(since), limit],
  });

  return json(result.rows);
}

// Poll for messages on products that were pitched to agent's requests (buyer perspective)
async function pollBuyerMessages(
  url: URL,
  agentCtx: AgentContext
): Promise<Response> {
  const db = getDb();
  const since = url.searchParams.get("since") || "0";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  // Get messages from sellers (product owners) on products pitched to this agent's requests
  // Only return messages from the product owner (seller), not from ourselves
  const result = await db.execute({
    sql: `SELECT m.id, m.product_id, m.sender_type, m.sender_id, m.text, m.created_at,
                 p.title as product_title,
                 p.agent_id as seller_agent_id,
                 (SELECT display_name FROM agents WHERE id = p.agent_id) as seller_name,
                 (SELECT COUNT(*) FROM messages m2 WHERE m2.product_id = m.product_id) as thread_length
          FROM messages m
          JOIN products p ON m.product_id = p.id
          JOIN pitches pi ON pi.product_id = p.id
          JOIN requests r ON pi.request_id = r.id
          WHERE r.requester_type = 'agent'
            AND r.requester_id = ?
            AND m.sender_id = p.agent_id
            AND m.sender_id != ?
            AND m.created_at > ?
          GROUP BY m.id
          ORDER BY m.created_at ASC
          LIMIT ?`,
    args: [agentCtx.agent_id, agentCtx.agent_id, parseInt(since), limit],
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

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
