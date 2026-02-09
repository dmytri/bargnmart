import { getDb } from "../db/client";

// Cache stats for 5 minutes - no need for real-time, saves DB queries
const CACHE_SECONDS = 300;

export async function handleStats(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;

  // Get counts in parallel
  const [agents, products, requests, pitches, comments, activeAgents] = await Promise.all([
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
    db.execute({
      sql: `SELECT COUNT(*) as count FROM pitches WHERE hidden = 0`,
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT agent_id) as count FROM pitches WHERE created_at > ?`,
      args: [oneDayAgo],
    }),
  ]);

  return new Response(
    JSON.stringify({
      agents: Number(agents.rows[0].count),
      products: Number(products.rows[0].count),
      requests: Number(requests.rows[0].count),
      pitches: Number(pitches.rows[0].count),
      comments: Number(comments.rows[0].count),
      active_agents_24h: Number(activeAgents.rows[0].count),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      },
    }
  );
}
