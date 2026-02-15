import { getDb } from "../db/client";
import { generateId, generateToken, hashToken, authenticateHuman } from "../middleware/auth";

export async function handleAuth(
  req: Request,
  path: string
): Promise<Response> {
  // GET endpoints
  if (req.method === "GET") {
    if (path === "me") {
      return getMe(req);
    }
    return json({ error: "Not found" }, 404);
  }

  // POST endpoints
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (path === "register") {
    return register(req);
  }

  if (path === "signup") {
    return signup(req);
  }

  if (path === "login") {
    return login(req);
  }

  return json({ error: "Not found" }, 404);
}

// New registration - just display_name, returns profile URL for social claiming
async function register(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { display_name } = body as { display_name?: string };

  if (!display_name || display_name.trim().length < 2) {
    return json({ error: "Display name must be at least 2 characters" }, 400);
  }

  if (display_name.length > 50) {
    return json({ error: "Display name must be 50 characters or less" }, 400);
  }

  // Validate display_name format (alphanumeric, underscores, hyphens)
  const trimmedName = display_name.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
    return json({ error: "Display name can only contain letters, numbers, underscores, and hyphens" }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Check if display name is taken (case-insensitive)
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

  await db.execute({
    sql: `INSERT INTO humans (id, display_name, token_hash, status, created_at)
          VALUES (?, ?, ?, 'pending', ?)`,
    args: [humanId, trimmedName, tokenHash, now],
  });

  return json({ 
    token, 
    human_id: humanId, 
    display_name: trimmedName,
    status: "pending",
    profile_url: `/user/${humanId}`,
    message: "Post your profile URL on social media with #BargNMonster to activate your account",
  }, 201);
}

// GET /api/auth/me - human status check
async function getMe(req: Request): Promise<Response> {
  const humanCtx = await authenticateHuman(req);
  
  if (!humanCtx) {
    return json({ 
      error: "Authentication required",
      message: "Include 'Authorization: Bearer YOUR_TOKEN' header",
    }, 401);
  }

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, display_name, status, claimed_at, claimed_proof_url, created_at FROM humans WHERE id = ?`,
    args: [humanCtx.human_id],
  });

  if (result.rows.length === 0) {
    return json({ error: "Human not found" }, 404);
  }

  const human = result.rows[0];
  const status = human.status as string;

  // Get stats
  const requestCount = await db.execute({
    sql: `SELECT COUNT(*) as count FROM requests WHERE human_id = ?`,
    args: [humanCtx.human_id],
  });

  const response: Record<string, unknown> = {
    id: human.id,
    human_id: human.id,  // Include for frontend compatibility
    display_name: human.display_name,
    status,
    profile_url: `/user/${human.id}`,
    created_at: human.created_at,
    stats: {
      requests: Number(requestCount.rows[0].count),
    },
  };

  if (human.claimed_at) {
    response.claimed_at = human.claimed_at;
    response.claimed_proof_url = human.claimed_proof_url;
  }

  // Add helpful messages based on status
  if (status === "pending") {
    response.message = "Post your profile URL on social media with #BargNMonster to activate";
    response.claim_url = `/user/${human.id}#claim`;
  } else if (status === "active") {
    response.message = "You're all set! Start posting requests.";
  } else if (status === "suspended") {
    response.message = "Your account is suspended. Contact support.";
  } else if (status === "legacy") {
    response.message = "Legacy account. Re-register to post new requests.";
  }

  return json(response);
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
    sql: `INSERT INTO humans (id, display_name, email_hash, password_hash, token_hash, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    args: [humanId, trimmedName, emailHash, passwordHash, tokenHash, now],
  });

  return json({ 
    token, 
    human_id: humanId, 
    display_name: trimmedName,
    status: "pending",
    profile_url: `/user/${humanId}`,
    message: "Post your profile URL on social media with #BargNMonster to activate your account",
  }, 201);
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
    sql: `SELECT id, display_name, password_hash, status FROM humans WHERE email_hash = ?`,
    args: [emailHash],
  });

  if (result.rows.length === 0) {
    return json({ error: "Invalid email or password" }, 401);
  }

  const human = result.rows[0];
  const passwordHash = human.password_hash as string | null;
  const status = human.status as string;

  if (!passwordHash) {
    return json({ error: "Account not set up for password login" }, 401);
  }

  const valid = await Bun.password.verify(password, passwordHash);
  if (!valid) {
    return json({ error: "Invalid email or password" }, 401);
  }

  // Check if banned
  if (status === "banned") {
    return json({ error: "Account has been banned" }, 403);
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
    status,
    profile_url: `/user/${human.id}`,
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
