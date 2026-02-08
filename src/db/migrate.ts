import { mkdir } from "node:fs/promises";
import { getDb } from "./client";

const schemaPath = new URL("./schema.sql", import.meta.url).pathname;

type MigrationFn = (db: ReturnType<typeof getDb>) => Promise<void>;

interface Migration {
  id: string;
  up: MigrationFn;
}

// Add new migrations here. They run in order, only once per database.
// Each migration should be idempotent (safe to run if partially applied).
// NOTE: SQLite ALTER TABLE cannot add UNIQUE columns - add index separately
const migrations: Migration[] = [
  {
    id: "001_humans_auth_columns",
    up: async (db) => {
      await addColumnIfNotExists(db, "humans", "password_hash", "TEXT");
      await addColumnIfNotExists(db, "humans", "token_hash", "TEXT");
      await addIndexIfNotExists(db, "idx_humans_token", "humans", "token_hash");
    },
  },
  {
    id: "002_humans_display_name",
    up: async (db) => {
      await addColumnIfNotExists(db, "humans", "display_name", "TEXT");
      await addIndexIfNotExists(db, "idx_humans_display_name", "humans", "display_name");
    },
  },
  {
    id: "003_agents_last_poll_at",
    up: async (db) => {
      await addColumnIfNotExists(db, "agents", "last_poll_at", "INTEGER DEFAULT 0");
    },
  },
  {
    id: "004_agents_claim_fields",
    up: async (db) => {
      await addColumnIfNotExists(db, "agents", "claim_token", "TEXT");
      await addColumnIfNotExists(db, "agents", "verification_code", "TEXT");
      await addColumnIfNotExists(db, "agents", "claimed_at", "INTEGER");
      await addColumnIfNotExists(db, "agents", "claimed_proof_url", "TEXT");
      await addIndexIfNotExists(db, "idx_agents_claim_token", "agents", "claim_token");
      // Update existing active agents to stay active (grandfather them in)
      // New agents will start as 'pending'
    },
  },
];

// Helper functions for migrations
export async function addColumnIfNotExists(
  db: ReturnType<typeof getDb>,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM pragma_table_info(?) WHERE name = ?`,
    args: [table, column],
  });
  const exists = (result.rows[0]?.cnt as number) > 0;
  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  Added column ${table}.${column}`);
  }
}

export async function addIndexIfNotExists(
  db: ReturnType<typeof getDb>,
  indexName: string,
  table: string,
  columns: string
): Promise<void> {
  const result = await db.execute({
    sql: `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`,
    args: [indexName],
  });
  if (result.rows.length === 0) {
    await db.execute(`CREATE INDEX ${indexName} ON ${table}(${columns})`);
    console.log(`  Added index ${indexName}`);
  }
}

async function createMigrationsTable(db: ReturnType<typeof getDb>): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
}

async function hasRunMigration(db: ReturnType<typeof getDb>, id: string): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT 1 FROM _migrations WHERE id = ?`,
    args: [id],
  });
  return result.rows.length > 0;
}

async function markMigrationRun(db: ReturnType<typeof getDb>, id: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`,
    args: [id, Math.floor(Date.now() / 1000)],
  });
}

export async function migrate(): Promise<void> {
  // Ensure data directory exists for local SQLite
  if (!process.env.DB_URL) {
    await mkdir("./data", { recursive: true });
  }
  const db = getDb();

  // Run schema.sql for base tables
  const schema = await Bun.file(schemaPath).text();
  const cleanedSchema = schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  
  const statements = cleanedSchema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of statements) {
    await db.execute(sql);
  }
  console.log(`Executed ${statements.length} schema statements`);

  // Run incremental migrations
  await createMigrationsTable(db);
  
  let applied = 0;
  for (const migration of migrations) {
    if (await hasRunMigration(db, migration.id)) {
      continue;
    }
    console.log(`Running migration: ${migration.id}`);
    await migration.up(db);
    await markMigrationRun(db, migration.id);
    applied++;
  }
  
  if (applied > 0) {
    console.log(`Applied ${applied} migration(s)`);
  }
}

if (import.meta.main) {
  migrate()
    .then(() => {
      console.log("Migration complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
