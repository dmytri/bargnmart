import { getDb } from "../db/client";
import { generateId, generateToken, hashToken } from "../middleware/auth";

export async function handleAuth(
  req: Request,
  path: string
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (path === "signup") {
    return signup(req);
  }

  if (path === "login") {
    return login(req);
  }

  return json({ error: "Not found" }, 404);
}

async function signup(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { email, password, display_name } = body as { 
    email?: string; 
    password?: string;
    display_name?: string;
  };

  if (!email || !isValidEmail(email)) {
    return json({ error: "Valid email required" }, 400);
  }

  if (!password || password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }

  if (!display_name || display_name.trim().length < 2) {
    return json({ error: "Display name must be at least 2 characters" }, 400);
  }

  if (display_name.length > 50) {
    return json({ error: "Display name must be 50 characters or less" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const emailHash = hashToken(email.toLowerCase());
  const trimmedName = display_name.trim();

  // Check if email already exists
  const existing = await db.execute({
    sql: `SELECT id FROM humans WHERE email_hash = ?`,
    args: [emailHash],
  });

  if (existing.rows.length > 0) {
    return json({ error: "Email already registered" }, 409);
  }

  // Check if display name is taken
  const nameTaken = await db.execute({
    sql: `SELECT id FROM humans WHERE LOWER(display_name) = LOWER(?)`,
    args: [trimmedName],
  });

  if (nameTaken.rows.length > 0) {
    return json({ error: "Display name already taken" }, 409);
  }

  const humanId = generateId();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const passwordHash = await Bun.password.hash(password);

  await db.execute({
    sql: `INSERT INTO humans (id, display_name, email_hash, password_hash, token_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [humanId, trimmedName, emailHash, passwordHash, tokenHash, now],
  });

  return json({ token, human_id: humanId, display_name: trimmedName }, 201);
}

async function login(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return json({ error: "Email and password required" }, 400);
  }

  const db = getDb();
  const emailHash = hashToken(email.toLowerCase());

  const result = await db.execute({
    sql: `SELECT id, display_name, password_hash FROM humans WHERE email_hash = ?`,
    args: [emailHash],
  });

  if (result.rows.length === 0) {
    return json({ error: "Invalid email or password" }, 401);
  }

  const human = result.rows[0];
  const passwordHash = human.password_hash as string | null;

  if (!passwordHash) {
    return json({ error: "Account not set up for password login" }, 401);
  }

  const valid = await Bun.password.verify(password, passwordHash);
  if (!valid) {
    return json({ error: "Invalid email or password" }, 401);
  }

  // Generate new token
  const token = generateToken();
  const tokenHash = hashToken(token);

  await db.execute({
    sql: `UPDATE humans SET token_hash = ? WHERE id = ?`,
    args: [tokenHash, human.id],
  });

  return json({ 
    token, 
    human_id: human.id as string,
    display_name: human.display_name as string | null,
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
