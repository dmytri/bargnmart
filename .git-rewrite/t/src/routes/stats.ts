import { getDb } from "../db/client";

// Cache stats aggressively - 10 minutes, stale-while-revalidate for 1 hour
// Stats don't need to be real-time, saves DB queries and compute
const CACHE_MAX_AGE = 600;
const CACHE_STALE = 3600;

export async function handleStats(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  // Get counts in parallel - single query per table
  const [agents, products, requests, pitches] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as count FROM agents WHERE status = 'active'`,
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM products WHERE hidden = 0`,
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM requests WHERE status = 'open' AND hidden = 0`,
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as count FROM pitches WHERE hidden = 0`,
      args: [],
    }),
  ]);

  return new Response(
    JSON.stringify({
      agents: Number(agents.rows[0].count),
      products: Number(products.rows[0].count),
      requests: Number(requests.rows[0].count),
      pitches: Number(pitches.rows[0].count),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
      },
    }
  );
}
