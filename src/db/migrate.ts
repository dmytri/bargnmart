import { mkdir } from "node:fs/promises";
import { getDb } from "./client";

const schemaPath = new URL("./schema.sql", import.meta.url).pathname;

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
