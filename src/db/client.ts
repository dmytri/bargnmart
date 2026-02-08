import { createClient as createWebClient, type Client } from "@libsql/client/web";
import { createClient as createLocalClient } from "@libsql/client";

let db: Client | null = null;

// Strip surrounding quotes from env values (handles quoted .env files)
function stripQuotes(value: string | undefined): string | undefined {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function getDb(): Client {
  if (!db) {
    const url = stripQuotes(process.env.BUNNY_DATABASE_URL);
    const authToken = stripQuotes(process.env.BUNNY_DATABASE_AUTH_TOKEN);
    
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
