import { getDb } from "../db/client";
import { authenticateHuman, type HumanContext } from "../middleware/auth";

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

  // POST /api/notifications/pitch/:pitchId/seen - mark specific pitch as seen
  if (req.method === "POST" && subPath.startsWith("/pitch/") && subPath.endsWith("/seen")) {
    const pitchId = subPath.replace(/^\/pitch\//, "").replace(/\/seen$/, "");
    return markPitchSeen(humanCtx, pitchId);
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

  // Count new pitches on user's open requests since last seen (per-pitch timestamps)
  const pitchResult = await db.execute({
    sql: `SELECT COUNT(*) as count
          FROM pitches p
          JOIN requests r ON p.request_id = r.id
          WHERE r.requester_type = 'human' 
            AND r.requester_id = ?
            AND r.status = 'open'
            AND p.hidden = 0
            AND (p.human_last_seen_at = 0 OR p.created_at > p.human_last_seen_at)`,
    args: [humanCtx.human_id],
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

  const total = Number(newPitches) + Number(newMessages);

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

  // Update global last seen timestamp
  await db.execute({
    sql: `UPDATE humans SET last_seen_notifications = ? WHERE id = ?`,
    args: [now, humanCtx.human_id],
  });

  // Update per-pitch timestamps for all pitches on user's open requests
  await db.execute({
    sql: `UPDATE pitches SET human_last_seen_at = ?
          WHERE request_id IN (
            SELECT id FROM requests 
            WHERE requester_type = 'human' AND requester_id = ? AND status = 'open'
          )
          AND hidden = 0
          AND (human_last_seen_at = 0 OR human_last_seen_at < ?)`,
    args: [now, humanCtx.human_id, now],
  });

  return json({ success: true, last_seen: now });
}

async function markPitchSeen(
  humanCtx: HumanContext,
  pitchId: string
): Promise<Response> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Verify the pitch belongs to one of the human's requests
  const result = await db.execute({
    sql: `UPDATE pitches SET human_last_seen_at = ?
          WHERE id = ?
            AND request_id IN (
              SELECT id FROM requests 
              WHERE requester_type = 'human' AND requester_id = ?
            )`,
    args: [now, pitchId, humanCtx.human_id],
  });

  if (result.rowsAffected === 0) {
    return json({ error: "Pitch not found or not owned by user" }, 404);
  }

  return json({ success: true });
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
