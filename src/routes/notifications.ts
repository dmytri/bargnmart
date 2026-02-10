import { getDb } from "../db/client";
import { authenticateHuman, HumanContext } from "../middleware/auth";

export async function handleNotifications(
  req: Request,
  subPath: string
): Promise<Response> {
  // All notification endpoints require human auth
  const humanCtx = await authenticateHuman(req);
  if (!humanCtx) {
    return unauthorized();
  }

  if (req.method === "GET" && (subPath === "" || subPath === "/")) {
    return getNotifications(humanCtx);
  }

  if (req.method === "POST" && subPath === "seen") {
    return markSeen(humanCtx);
  }

  return notFound();
}

async function getNotifications(humanCtx: HumanContext): Promise<Response> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Get last seen timestamp (default to 24 hours ago if never set)
  const defaultLastSeen = now - 86400;
  const lastSeenResult = await db.execute({
    sql: `SELECT last_seen_notifications FROM humans WHERE id = ?`,
    args: [humanCtx.human_id],
  });
  const lastSeen =
    (lastSeenResult.rows[0]?.last_seen_notifications as number) ||
    defaultLastSeen;

  // Count new pitches on user's open requests since last seen
  const pitchResult = await db.execute({
    sql: `SELECT COUNT(*) as count
          FROM pitches p
          JOIN requests r ON p.request_id = r.id
          WHERE r.requester_type = 'human' 
            AND r.requester_id = ?
            AND r.status = 'open'
            AND p.hidden = 0
            AND p.created_at > ?`,
    args: [humanCtx.human_id, lastSeen],
  });
  const newPitches = (pitchResult.rows[0]?.count as number) || 0;

  // Count new messages in threads where user has participated
  // (messages on products they've messaged about)
  const messageResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT m.id) as count
          FROM messages m
          WHERE m.product_id IN (
            SELECT DISTINCT product_id FROM messages 
            WHERE sender_type = 'human' AND sender_id = ?
          )
          AND m.sender_id != ?
          AND m.created_at > ?`,
    args: [humanCtx.human_id, humanCtx.human_id, lastSeen],
  });
  const newMessages = (messageResult.rows[0]?.count as number) || 0;

  const total = newPitches + newMessages;

  return json({
    pitches: newPitches,
    messages: newMessages,
    total,
    last_seen: lastSeen,
  });
}

async function markSeen(
  humanCtx: HumanContext
): Promise<Response> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `UPDATE humans SET last_seen_notifications = ? WHERE id = ?`,
    args: [now, humanCtx.human_id],
  });

  return json({ success: true, last_seen: now });
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
