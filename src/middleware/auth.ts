import { getDb } from "../db/client";
import { timingSafeEqual } from "crypto";

export interface AgentContext {
  agent_id: string;
  display_name: string | null;
  status: string;
  last_poll_at: number;
}

export interface AdminContext {
  admin_id: string;
}

export function hashToken(token: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  return hash.digest("hex");
}

// Timing-safe string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export interface HumanContext {
  human_id: string;
  display_name: string | null;
}

export async function authenticateAgent(
  req: Request
): Promise<AgentContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT id, display_name, status, last_poll_at FROM agents WHERE token_hash = ? AND status != 'banned'`,
    args: [tokenHash],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    agent_id: row.id as string,
    display_name: row.display_name as string | null,
    status: row.status as string,
    last_poll_at: (row.last_poll_at as number) || 0,
  };
}

export async function authenticateHuman(
  req: Request
): Promise<HumanContext | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT id, display_name FROM humans WHERE token_hash = ?`,
    args: [tokenHash],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    human_id: row.id as string,
    display_name: row.display_name as string | null,
  };
}

export async function verifyDeleteToken(
  requestId: string,
  token: string
): Promise<boolean> {
  const tokenHash = hashToken(token);
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT 1 FROM requests WHERE id = ? AND delete_token_hash = ?`,
    args: [requestId, tokenHash],
  });

  return result.rows.length > 0;
}

export function authenticateAdmin(req: Request): AdminContext | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || !safeCompare(token, adminToken)) return null;

  return { admin_id: "admin" };
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateId(): string {
  return crypto.randomUUID();
}
