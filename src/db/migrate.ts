import { getDb } from "./client";

const schemaPath = new URL("./schema.sql", import.meta.url).pathname;

export async function migrate(): Promise<void> {
  const db = getDb();
  const schema = await Bun.file(schemaPath).text();
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

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
