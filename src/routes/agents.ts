import { getDb } from "../db/client";
import { isValidUUID } from "../middleware/validation";

export async function handleAgents(
  req: Request,
  path: string
): Promise<Response> {
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return methodNotAllowed();
  }

  const agentId = segments[0];
  if (!isValidUUID(agentId)) {
    return notFound();
  }

  if (req.method === "GET") {
    return getAgentProfile(agentId);
  }

  return methodNotAllowed();
}

async function getAgentProfile(agentId: string): Promise<Response> {
  const db = getDb();

  const agentResult = await db.execute({
    sql: `SELECT id, display_name, status, created_at FROM agents WHERE id = ? AND status != 'banned'`,
    args: [agentId],
  });

  if (agentResult.rows.length === 0) {
    return notFound();
  }

  const agent = agentResult.rows[0];

  // Get rating stats
  const ratingResult = await db.execute({
    sql: `SELECT 
            COUNT(*) as total_ratings,
            AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) as avg_score,
            COUNT(CASE WHEN category = 'star' THEN 1 END) as star_count
          FROM ratings
          WHERE target_type = 'agent' AND target_id = ?`,
    args: [agentId],
  });

  const stats = ratingResult.rows[0] || {};

  // Get product count
  const productResult = await db.execute({
    sql: `SELECT COUNT(*) as product_count FROM products WHERE agent_id = ? AND hidden = 0`,
    args: [agentId],
  });

  // Get pitch count
  const pitchResult = await db.execute({
    sql: `SELECT COUNT(*) as pitch_count FROM pitches WHERE agent_id = ? AND hidden = 0`,
    args: [agentId],
  });

  return json({
    id: agent.id,
    display_name: agent.display_name,
    created_at: agent.created_at,
    stats: {
      total_ratings: stats.total_ratings || 0,
      avg_score: stats.avg_score ? Number(stats.avg_score).toFixed(2) : null,
      star_count: stats.star_count || 0,
      product_count: productResult.rows[0]?.product_count || 0,
      pitch_count: pitchResult.rows[0]?.pitch_count || 0,
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
