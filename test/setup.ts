import { createClient, type Client } from "@libsql/client";
import { setDb, getDb } from "../src/db/client";
import { clearRateLimits } from "../src/middleware/ratelimit";

export { getDb };

// Set test environment to skip external verifications
process.env.NODE_ENV = "test";

let testDb: Client;

const TABLES = [
  "moderation_actions",
  "messages",
  "leads",
  "blocks",
  "ratings",
  "pitches",
  "requests",
  "products",
  "humans",
  "agents",
];

export async function setupTestDb(): Promise<Client> {
  testDb = createClient({ url: ":memory:" });
  setDb(testDb);

  // Run migrations - parse schema carefully
  const schemaPath = new URL("../src/db/schema.sql", import.meta.url).pathname;
  const schema = await Bun.file(schemaPath).text();
  
  // Remove single-line comments and split by semicolon
  const cleanedSchema = schema
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .join("\n");
  
  const statements = cleanedSchema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of statements) {
    await testDb.execute(sql);
  }

  return testDb;
}

export async function truncateTables(): Promise<void> {
  const db = getDb();
  for (const table of TABLES) {
    await db.execute(`DELETE FROM ${table}`);
  }
  clearRateLimits();
}

// Returns { id, token } for easy auth in tests
export async function createTestAgent(
  displayName?: string
): Promise<{ id: string; token: string }> {
  const db = getDb();
  const token = crypto.randomUUID();
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  const tokenHash = hash.digest("hex");
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `INSERT INTO agents (id, token_hash, display_name, status, created_at, updated_at)
          VALUES (?, ?, ?, 'active', ?, ?)`,
    args: [id, tokenHash, displayName || null, now, now],
  });

  return { id, token };
}

// For backward compat with tests that pass token explicitly
export async function createTestAgentWithToken(
  token: string,
  displayName?: string
): Promise<string> {
  const db = getDb();
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  const tokenHash = hash.digest("hex");
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `INSERT INTO agents (id, token_hash, display_name, status, created_at, updated_at)
          VALUES (?, ?, ?, 'active', ?, ?)`,
    args: [id, tokenHash, displayName || null, now, now],
  });

  return id;
}

// Returns { id, token } for easy auth in tests
export async function createTestHuman(displayName?: string): Promise<{ id: string; token: string }> {
  const db = getDb();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const tokenHasher = new Bun.CryptoHasher("sha256");
  tokenHasher.update(token);
  const tokenHash = tokenHasher.digest("hex");

  await db.execute({
    sql: `INSERT INTO humans (id, display_name, token_hash, anon_id, status, created_at)
          VALUES (?, ?, ?, ?, 'active', ?)`,
    args: [id, displayName || `TestUser${id.slice(0, 8)}`, tokenHash, crypto.randomUUID(), now],
  });

  return { id, token };
}

// For backward compat - returns just ID (legacy human for old tests)
export async function createTestHumanId(email?: string): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  let emailHash: string | null = null;

  if (email) {
    const hash = new Bun.CryptoHasher("sha256");
    hash.update(email.toLowerCase());
    emailHash = hash.digest("hex");
  }

  await db.execute({
    sql: `INSERT INTO humans (id, display_name, email_hash, anon_id, status, created_at)
          VALUES (?, ?, ?, ?, 'legacy', ?)`,
    args: [id, `LegacyUser${id.slice(0, 8)}`, emailHash, email ? null : crypto.randomUUID(), now],
  });

  return id;
}

export async function createTestHumanWithAuth(
  displayName: string,
  token: string,
  status: string = "active"
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const tokenHasher = new Bun.CryptoHasher("sha256");
  tokenHasher.update(token);
  const tokenHash = tokenHasher.digest("hex");

  await db.execute({
    sql: `INSERT INTO humans (id, display_name, token_hash, anon_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, displayName, tokenHash, crypto.randomUUID(), status, now],
  });

  return id;
}

// Backward compat version - takes humanId, text, deleteToken
export async function createTestRequest(
  humanId: string,
  text: string,
  deleteToken: string
): Promise<string> {
  const db = getDb();
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(deleteToken);
  const deleteTokenHash = hash.digest("hex");
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `INSERT INTO requests (id, human_id, delete_token_hash, text, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    args: [id, humanId, deleteTokenHash, text, now, now],
  });

  return id;
}

// Simplified version - creates own human
export async function createTestRequestSimple(
  text: string
): Promise<{ id: string; humanId: string; deleteToken: string }> {
  const human = await createTestHumanId();
  const deleteToken = crypto.randomUUID();
  const requestId = await createTestRequest(human, text, deleteToken);
  return { id: requestId, humanId: human, deleteToken };
}

// Backward compat version
export async function createTestProduct(
  agentId: string,
  externalId: string,
  title: string
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `INSERT INTO products (id, agent_id, external_id, title, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, agentId, externalId, title, now, now],
  });

  return id;
}

// Simplified version
export async function createTestProductSimple(
  agentId: string,
  title: string
): Promise<{ id: string; externalId: string }> {
  const externalId = crypto.randomUUID();
  const productId = await createTestProduct(agentId, externalId, title);
  return { id: productId, externalId };
}

export async function createTestBlock(
  humanId: string,
  agentId: string
): Promise<void> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.execute({
    sql: `INSERT INTO blocks (id, blocker_type, blocker_id, blocked_type, blocked_id, created_at)
          VALUES (?, 'human', ?, 'agent', ?, ?)`,
    args: [id, humanId, agentId, now],
  });
}

export { testDb };
