import { createClient as createWebClient, type Client } from "@libsql/client/web";
import { createClient as createLocalClient } from "@libsql/client";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    const url = process.env.DB_URL;
    const authToken = process.env.DB_TOKEN;
    
    if (url) {
      // Use remote libSQL if DB_URL is provided
      db = createWebClient({ url, authToken });
    } else {
      // Use local SQLite file
      db = createLocalClient({ url: "file:./data/bargn.db" });
    }
  }
  return db;
}

export function setDb(client: Client): void {
  db = client;
}

export function resetDb(): void {
  db = null;
}
