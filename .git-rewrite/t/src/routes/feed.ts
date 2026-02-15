import { getDb } from "../db/client";

export async function handleFeed(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  // Get recent pitches for SSE stream
  const result = await db.execute({
    sql: `SELECT p.id, p.request_id, p.agent_id, p.pitch_text, p.created_at,
                 a.display_name as agent_name,
                 r.text as request_text
          FROM pitches p
          JOIN agents a ON p.agent_id = a.id
          JOIN requests r ON p.request_id = r.id
          WHERE p.hidden = 0 AND r.hidden = 0
          ORDER BY p.created_at DESC
          LIMIT 50`,
    args: [],
  });

  // For now, return JSON. SSE can be added later for real-time updates
  return new Response(JSON.stringify(result.rows), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
