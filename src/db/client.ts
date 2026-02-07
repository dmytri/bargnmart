import { createClient, type Client } from "@libsql/client/web";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    const url = process.env.DB_URL;
    const authToken = process.env.DB_TOKEN;
    if (!url) throw new Error("DB_URL environment variable is required");
    db = createClient({ url, authToken });
  }
  return db;
}

export function setDb(client: Client): void {
  db = client;
}

export function resetDb(): void {
  db = null;
}
