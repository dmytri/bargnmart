import { getDb } from "../db/client";
import { generateId, type AgentContext } from "../middleware/auth";
import { isValidUUID } from "../middleware/validation";

export async function handleReputation(
  req: Request,
  path: string,
  agentCtx: AgentContext | null
): Promise<Response> {
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    if (req.method === "POST") {
      if (!agentCtx) return unauthorized();
      return createAgentRating(req, agentCtx);
    }
    return methodNotAllowed();
  }

  if (segments[0] === "mine") {
    if (!agentCtx) return unauthorized();
    if (req.method === "GET") return getMyReputation(agentCtx);
    return methodNotAllowed();
  }

  return notFound();
}

async function createAgentRating(
  req: Request,
  agentCtx: AgentContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { human_id, category } = body as {
    human_id?: string;
    category?: string;
  };

  if (!human_id || !isValidUUID(human_id)) {
    return json({ error: "valid human_id required" }, 400);
  }

  if (!category || !["abusive", "unserious", "useful"].includes(category)) {
    return json(
      { error: "category must be 'abusive', 'unserious', or 'useful'" },
      400
    );
  }

  const db = getDb();

  // Verify human exists
  const humanCheck = await db.execute({
    sql: `SELECT id FROM humans WHERE id = ?`,
    args: [human_id],
  });

  if (humanCheck.rows.length === 0) {
    return json({ error: "Human not found" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, category, created_at)
          VALUES (?, 'agent', ?, 'human', ?, ?, ?)
          ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE SET
            category = excluded.category, created_at = excluded.created_at`,
    args: [id, agentCtx.agent_id, human_id, category, now],
  });

  return json({ success: true });
}

async function getMyReputation(agentCtx: AgentContext): Promise<Response> {
  const db = getDb();

  // Get rating stats
  const ratingResult = await db.execute({
    sql: `SELECT 
            COUNT(*) as total_ratings,
            AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) as avg_score,
            COUNT(CASE WHEN category = 'star' THEN 1 END) as star_count,
            COUNT(CASE WHEN score = 1 THEN 1 END) as score_1,
            COUNT(CASE WHEN score = 2 THEN 1 END) as score_2,
            COUNT(CASE WHEN score = 3 THEN 1 END) as score_3,
            COUNT(CASE WHEN score = 4 THEN 1 END) as score_4,
            COUNT(CASE WHEN score = 5 THEN 1 END) as score_5
          FROM ratings
          WHERE target_type = 'agent' AND target_id = ?`,
    args: [agentCtx.agent_id],
  });

  const stats = ratingResult.rows[0] || {};

  // Get pitch count
  const pitchResult = await db.execute({
    sql: `SELECT COUNT(*) as pitch_count FROM pitches WHERE agent_id = ?`,
    args: [agentCtx.agent_id],
  });

  // Get product count
  const productResult = await db.execute({
    sql: `SELECT COUNT(*) as product_count FROM products WHERE agent_id = ?`,
    args: [agentCtx.agent_id],
  });

  return json({
    agent_id: agentCtx.agent_id,
    display_name: agentCtx.display_name,
    ratings: {
      total: stats.total_ratings || 0,
      avg_score: stats.avg_score ? Number(stats.avg_score).toFixed(2) : null,
      star_count: stats.star_count || 0,
      distribution: {
        1: stats.score_1 || 0,
        2: stats.score_2 || 0,
        3: stats.score_3 || 0,
        4: stats.score_4 || 0,
        5: stats.score_5 || 0,
      },
    },
    activity: {
      pitch_count: pitchResult.rows[0]?.pitch_count || 0,
      product_count: productResult.rows[0]?.product_count || 0,
    },
  });
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
