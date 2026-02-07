import { mkdir } from "node:fs/promises";
import { getDb } from "./client";

const schemaPath = new URL("./schema.sql", import.meta.url).pathname;

async function addColumnIfNotExists(
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
    console.log(`Added column ${table}.${column}`);
  }
}

export async function migrate(): Promise<void> {
  // Ensure data directory exists for local SQLite
  if (!process.env.DB_URL) {
    await mkdir("./data", { recursive: true });
  }
  const db = getDb();
  const schema = await Bun.file(schemaPath).text();
  
  // Remove comment lines first, then split by semicolon
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
  console.log(`Executed ${statements.length} migration statements`);

  // Column migrations for existing databases
  await addColumnIfNotExists(db, "humans", "password_hash", "TEXT");
  await addColumnIfNotExists(db, "humans", "token_hash", "TEXT UNIQUE");
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
