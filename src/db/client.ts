import { createClient as createWebClient, type Client } from "@libsql/client/web";
import { createClient as createLocalClient } from "@libsql/client";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    const url = process.env.BUNNY_DATABASE_URL;
    const authToken = process.env.BUNNY_DATABASE_AUTH_TOKEN;
    
    if (url) {
      // Use Bunny Database (libSQL) in production
      db = createWebClient({ url, authToken });
    } else {
      // Use local SQLite file in development
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
