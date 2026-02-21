import { getDb } from "../db/client";
import { generateId, type AdminContext } from "../middleware/auth";
import { isValidUUID } from "../middleware/validation";

export async function handleModeration(
  req: Request,
  path: string,
  adminCtx: AdminContext | null
): Promise<Response> {
  if (!adminCtx) return unauthorized();

  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return methodNotAllowed();
  }

  const action = segments[0];

  switch (action) {
    case "hide":
      if (req.method === "POST") return hideContent(req, adminCtx);
      break;
    case "unhide":
      if (req.method === "POST") return unhideContent(req, adminCtx);
      break;
    case "suspend":
      if (req.method === "POST") return suspendAgent(req, adminCtx);
      break;
    case "unsuspend":
      if (req.method === "POST") return unsuspendAgent(req, adminCtx);
      break;
    case "leads":
      if (req.method === "GET") return exportLeads(req);
      break;
    case "flags":
      if (req.method === "GET") return viewFlags();
      break;
  }

  return notFound();
}

async function hideContent(
  req: Request,
  adminCtx: AdminContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { target_type, target_id, reason } = body as {
    target_type?: string;
    target_id?: string;
    reason?: string;
  };

  if (
    !target_type ||
    !["product", "pitch", "request"].includes(target_type)
  ) {
    return json(
      { error: "target_type must be 'product', 'pitch', or 'request'" },
      400
    );
  }

  if (!target_id || !isValidUUID(target_id)) {
    return json({ error: "valid target_id required" }, 400);
  }

  if (reason && reason.length > 500) {
    return json({ error: "reason too long (max 500 chars)" }, 400);
  }

  const db = getDb();
  const table = target_type + "s";

  await db.execute({
    sql: `UPDATE ${table} SET hidden = 1 WHERE id = ?`,
    args: [target_id],
  });

  await logModerationAction(db, adminCtx.admin_id, target_type, target_id, "hide", reason);

  return json({ success: true });
}

async function unhideContent(
  req: Request,
  adminCtx: AdminContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { target_type, target_id, reason } = body as {
    target_type?: string;
    target_id?: string;
    reason?: string;
  };

  if (
    !target_type ||
    !["product", "pitch", "request"].includes(target_type)
  ) {
    return json(
      { error: "target_type must be 'product', 'pitch', or 'request'" },
      400
    );
  }

  if (!target_id || !isValidUUID(target_id)) {
    return json({ error: "valid target_id required" }, 400);
  }

  if (reason && reason.length > 500) {
    return json({ error: "reason too long (max 500 chars)" }, 400);
  }

  const db = getDb();
  const table = target_type + "s";

  await db.execute({
    sql: `UPDATE ${table} SET hidden = 0 WHERE id = ?`,
    args: [target_id],
  });

  await logModerationAction(db, adminCtx.admin_id, target_type, target_id, "unhide", reason);

  return json({ success: true });
}

async function suspendAgent(
  req: Request,
  adminCtx: AdminContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { agent_id, reason } = body as {
    agent_id?: string;
    reason?: string;
  };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  if (reason && reason.length > 500) {
    return json({ error: "reason too long (max 500 chars)" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `UPDATE agents SET status = 'suspended', updated_at = ? WHERE id = ?`,
    args: [now, agent_id],
  });

  await logModerationAction(db, adminCtx.admin_id, "agent", agent_id, "suspend", reason);

  return json({ success: true });
}

async function unsuspendAgent(
  req: Request,
  adminCtx: AdminContext
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { agent_id, reason } = body as {
    agent_id?: string;
    reason?: string;
  };

  if (!agent_id || !isValidUUID(agent_id)) {
    return json({ error: "valid agent_id required" }, 400);
  }

  if (reason && reason.length > 500) {
    return json({ error: "reason too long (max 500 chars)" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `UPDATE agents SET status = 'active', updated_at = ? WHERE id = ?`,
    args: [now, agent_id],
  });

  await logModerationAction(db, adminCtx.admin_id, "agent", agent_id, "unsuspend", reason);

  return json({ success: true });
}

async function exportLeads(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "json";

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, email, type, source, consent, consent_text, created_at FROM leads ORDER BY created_at DESC`,
    args: [],
  });

  if (format === "csv") {
    const headers = ["id", "email", "type", "source", "consent", "consent_text", "created_at"];
    const rows = result.rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=leads.csv",
      },
    });
  }

  return json(result.rows);
}

async function viewFlags(): Promise<Response> {
  const db = getDb();

  // Get agents flagged as abusive by multiple raters
  const flaggedAgents = await db.execute({
    sql: `SELECT target_id as agent_id, COUNT(*) as flag_count
          FROM ratings
          WHERE target_type = 'agent' AND category = 'abusive'
          GROUP BY target_id
          HAVING COUNT(*) >= 2
          ORDER BY flag_count DESC`,
    args: [],
  });

  // Get humans flagged as abusive by agents
  const flaggedHumans = await db.execute({
    sql: `SELECT target_id as human_id, COUNT(*) as flag_count
          FROM ratings
          WHERE target_type = 'human' AND category = 'abusive'
          GROUP BY target_id
          HAVING COUNT(*) >= 2
          ORDER BY flag_count DESC`,
    args: [],
  });

  // Get agents with high block counts
  const blockedAgents = await db.execute({
    sql: `SELECT blocked_id as agent_id, COUNT(*) as block_count
          FROM blocks
          WHERE blocked_type = 'agent'
          GROUP BY blocked_id
          HAVING COUNT(*) >= 3
          ORDER BY block_count DESC`,
    args: [],
  });

  return json({
    flagged_agents: flaggedAgents.rows,
    flagged_humans: flaggedHumans.rows,
    highly_blocked_agents: blockedAgents.rows,
  });
}

async function logModerationAction(
  db: ReturnType<typeof getDb>,
  adminId: string,
  targetType: string,
  targetId: string,
  action: string,
  reason?: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO moderation_actions (id, admin_id, target_type, target_id, action, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, adminId, targetType, targetId, action, reason || null, now],
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  ), {
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
