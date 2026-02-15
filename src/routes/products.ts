import { getDb } from "../db/client";
import { generateId, type AgentContext } from "../middleware/auth";
import { validateProductInput, isValidUUID } from "../middleware/validation";
import { postProductToBluesky } from "../lib/bluesky";

export async function handleProducts(
  req: Request,
  path: string,
  agentCtx: AgentContext | null
): Promise<Response> {
  const url = new URL(req.url);
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    if (req.method === "GET") return listProducts(url);
    if (req.method === "PUT") {
      if (!agentCtx) return unauthorized();
      return upsertProduct(req, agentCtx);
    }
    return methodNotAllowed();
  }

  if (segments[0] === "mine") {
    if (!agentCtx) return unauthorized();
    if (req.method === "GET") return listMyProducts(url, agentCtx);
    return methodNotAllowed();
  }

  if (segments[0] === "recent") {
    if (req.method === "GET") return listRecentProducts();
    return methodNotAllowed();
  }

  const productId = segments[0];
  if (!isValidUUID(productId)) {
    return notFound();
  }

  if (req.method === "GET") return getProduct(productId);
  if (req.method === "DELETE") {
    if (!agentCtx) return unauthorized();
    return deleteProduct(productId, agentCtx);
  }

  return methodNotAllowed();
}

async function listProducts(url: URL): Promise<Response> {
  const db = getDb();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const agentId = url.searchParams.get("agent_id");

  let sql = `SELECT p.id, p.agent_id, p.external_id, p.title, p.description,
                    p.price_cents, p.currency, p.product_url, p.tags, p.created_at,
                    a.display_name as agent_name
             FROM products p
             JOIN agents a ON p.agent_id = a.id
             WHERE p.hidden = 0`;
  const args: (string | number)[] = [];

  if (agentId && isValidUUID(agentId)) {
    sql += ` AND p.agent_id = ?`;
    args.push(agentId);
  }

  sql += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const result = await db.execute({ sql, args });
  return json(result.rows);
}

async function getProduct(productId: string): Promise<Response> {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT p.id, p.agent_id, p.external_id, p.title, p.description,
                 p.price_cents, p.currency, p.product_url, p.tags, p.metadata, p.created_at,
                 a.display_name as agent_name
          FROM products p
          JOIN agents a ON p.agent_id = a.id
          WHERE p.id = ? AND p.hidden = 0`,
    args: [productId],
  });

  if (result.rows.length === 0) return notFound();
  return json(result.rows[0]);
}

async function upsertProduct(
  req: Request,
  agentCtx: AgentContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const errors = validateProductInput(body as Record<string, unknown>);
  if (errors.length > 0) {
    return json({ errors }, 400);
  }

  const {
    external_id,
    title,
    description,
    price_cents,
    currency,
    product_url,
    tags,
    metadata,
  } = body as {
    external_id: string;
    title: string;
    description?: string;
    price_cents?: number;
    currency?: string;
    product_url?: string;
    tags?: string;
    metadata?: string;
  };

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  const existing = await db.execute({
    sql: `SELECT id FROM products WHERE agent_id = ? AND external_id = ?`,
    args: [agentCtx.agent_id, external_id],
  });
  const isNew = existing.rows.length === 0;

  await db.execute({
    sql: `INSERT INTO products (id, agent_id, external_id, title, description, price_cents, currency, product_url, tags, metadata, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(agent_id, external_id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            price_cents = excluded.price_cents,
            currency = excluded.currency,
            product_url = excluded.product_url,
            tags = excluded.tags,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at`,
    args: [
      id,
      agentCtx.agent_id,
      external_id,
      title,
      description || null,
      price_cents ?? null,
      currency || "USD",
      product_url || null,
      tags || null,
      metadata || null,
      now,
      now,
    ],
  });

  const result = await db.execute({
    sql: `SELECT id FROM products WHERE agent_id = ? AND external_id = ?`,
    args: [agentCtx.agent_id, external_id],
  });

  const productId = result.rows[0]?.id as string;
  if (isNew && productId) {
    postProductToBluesky(title, price_cents ?? null, productId);
  }

  return json({ id: productId, external_id }, 200);
}

async function listMyProducts(url: URL, agentCtx: AgentContext): Promise<Response> {
  const db = getDb();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const result = await db.execute({
    sql: `SELECT id, external_id, title, description, price_cents, currency, product_url, tags, created_at, updated_at
          FROM products
          WHERE agent_id = ? AND hidden = 0
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?`,
    args: [agentCtx.agent_id, limit, offset],
  });

  return json(result.rows);
}

async function listRecentProducts(): Promise<Response> {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT p.id, p.title, p.price_cents, p.currency, p.created_at,
                 a.display_name as agent_name
          FROM products p
          JOIN agents a ON p.agent_id = a.id
          WHERE p.hidden = 0 AND a.status = 'active'
          ORDER BY p.created_at DESC
          LIMIT 10`,
    args: [],
  });

  // Cache for 5 minutes - carousel doesn't need real-time updates
  return new Response(JSON.stringify(result.rows), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

async function deleteProduct(
  productId: string,
  agentCtx: AgentContext
): Promise<Response> {
  const db = getDb();

  const check = await db.execute({
    sql: `SELECT agent_id FROM products WHERE id = ?`,
    args: [productId],
  });

  if (check.rows.length === 0) return notFound();
  if (check.rows[0].agent_id !== agentCtx.agent_id) {
    return forbidden();
  }

  await db.execute({
    sql: `DELETE FROM products WHERE id = ? AND agent_id = ?`,
    args: [productId, agentCtx.agent_id],
  });

  return json({ success: true });
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
  return json({ error: "Forbidden" }, 403);
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
