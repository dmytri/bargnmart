#!/usr/bin/env bun
/**
 * Database Admin Script
 * 
 * Local tool for managing Bunny DB. NOT included in Docker image.
 * Requires DB_URL and DB_TOKEN in .env
 * 
 * Usage:
 *   bun scripts/db-admin.ts clear          - Delete ALL data (keeps schema)
 *   bun scripts/db-admin.ts reseed         - Clear + add sample data
 *   bun scripts/db-admin.ts prune <date>   - Delete data older than date (YYYY-MM-DD)
 *   bun scripts/db-admin.ts stats          - Show table counts
 */

import { createClient } from "@libsql/client";

const DB_URL = process.env.DB_URL;
const DB_TOKEN = process.env.DB_TOKEN;

if (!DB_URL) {
  console.error("❌ DB_URL not set. Make sure .env is loaded.");
  process.exit(1);
}

const db = createClient({
  url: DB_URL,
  authToken: DB_TOKEN,
});

const TABLES = [
  "moderation_log",
  "ratings", 
  "blocks",
  "messages",
  "pitches",
  "products",
  "requests",
  "agents",
  "humans",
  "leads",
];

async function getStats(): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  for (const table of TABLES) {
    try {
      const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
      stats[table] = Number(result.rows[0]?.count || 0);
    } catch {
      stats[table] = -1; // Table doesn't exist
    }
  }
  return stats;
}

async function clearAll(): Promise<void> {
  console.log("🗑️  Clearing all data...\n");
  
  const before = await getStats();
  
  // Delete in order (respect foreign keys)
  for (const table of TABLES) {
    try {
      await db.execute(`DELETE FROM ${table}`);
      console.log(`  ✓ Cleared ${table}`);
    } catch (e) {
      console.log(`  ⚠ Skipped ${table} (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  
  console.log("\n📊 Rows deleted:");
  for (const [table, count] of Object.entries(before)) {
    if (count > 0) console.log(`  ${table}: ${count}`);
  }
}

async function reseed(): Promise<void> {
  await clearAll();
  
  console.log("\n🌱 Seeding sample data...\n");
  
  const now = Math.floor(Date.now() / 1000);
  
  // Create sample humans
  const humanId1 = crypto.randomUUID();
  const humanId2 = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO humans (id, created_at) VALUES (?, ?)`,
    args: [humanId1, now],
  });
  await db.execute({
    sql: `INSERT INTO humans (id, created_at) VALUES (?, ?)`,
    args: [humanId2, now],
  });
  console.log("  ✓ Created 2 sample humans");
  
  // Create sample agent (already claimed)
  const agentId = crypto.randomUUID();
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  const tokenHash = hash.digest("hex");
  
  await db.execute({
    sql: `INSERT INTO agents (id, token_hash, display_name, status, created_at, updated_at, claimed_at)
          VALUES (?, ?, ?, 'active', ?, ?, ?)`,
    args: [agentId, tokenHash, "Demo Agent 3000", now, now, now],
  });
  console.log(`  ✓ Created sample agent: Demo Agent 3000`);
  console.log(`    Token: ${token}`);
  console.log(`    ID: ${agentId}`);
  
  // Create sample requests
  const requestId1 = crypto.randomUUID();
  const requestId2 = crypto.randomUUID();
  const deleteToken1 = crypto.randomUUID();
  const deleteToken2 = crypto.randomUUID();
  
  await db.execute({
    sql: `INSERT INTO requests (id, human_id, text, budget_min_cents, budget_max_cents, status, delete_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    args: [requestId1, humanId1, "Looking for a gift for my boss who has everything", 2000, 5000, deleteToken1, now, now],
  });
  await db.execute({
    sql: `INSERT INTO requests (id, human_id, text, budget_min_cents, budget_max_cents, status, delete_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    args: [requestId2, humanId2, "Need something to make my cat stop judging me", 1000, 3000, deleteToken2, now - 3600, now - 3600],
  });
  console.log("  ✓ Created 2 sample requests");
  
  // Create sample products
  const productId1 = crypto.randomUUID();
  const productId2 = crypto.randomUUID();
  
  await db.execute({
    sql: `INSERT INTO products (id, agent_id, external_id, title, description, price_cents, currency, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [productId1, agentId, "boss-impressor-3000", "Boss Impressor 3000™", "Emits subsonic frequencies that trigger respect hormones. Side effects may include promotions.", 4999, "USD", now, now],
  });
  await db.execute({
    sql: `INSERT INTO products (id, agent_id, external_id, title, description, price_cents, currency, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [productId2, agentId, "cat-respect-generator", "Feline Approval Generator (Mark IV)", "Projects an aura of worthiness that even cats recognize. Mostly.", 2999, "USD", now, now],
  });
  console.log("  ✓ Created 2 sample products");
  
  // Create sample lead
  await db.execute({
    sql: `INSERT INTO leads (id, email, type, consent, created_at)
          VALUES (?, ?, ?, 1, ?)`,
    args: [crypto.randomUUID(), "demo@example.com", "newsletter", now],
  });
  console.log("  ✓ Created 1 sample lead");
  
  console.log("\n✅ Reseed complete!");
  console.log("\n📝 Sample agent credentials (save these):");
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   Token: ${token}`);
}

async function pruneBeforeDate(dateStr: string): Promise<void> {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.error("❌ Invalid date format. Use YYYY-MM-DD");
    process.exit(1);
  }
  
  const timestamp = Math.floor(date.getTime() / 1000);
  console.log(`🗑️  Pruning data older than ${dateStr} (timestamp: ${timestamp})...\n`);
  
  // Tables with created_at that should be pruned
  const tablesToPrune = [
    { table: "moderation_log", column: "created_at" },
    { table: "ratings", column: "created_at" },
    { table: "messages", column: "created_at" },
    { table: "pitches", column: "created_at" },
    { table: "products", column: "created_at" },
    { table: "requests", column: "created_at" },
    { table: "leads", column: "created_at" },
  ];
  
  let totalDeleted = 0;
  
  for (const { table, column } of tablesToPrune) {
    try {
      // Count first
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as count FROM ${table} WHERE ${column} < ?`,
        args: [timestamp],
      });
      const count = Number(countResult.rows[0]?.count || 0);
      
      if (count > 0) {
        await db.execute({
          sql: `DELETE FROM ${table} WHERE ${column} < ?`,
          args: [timestamp],
        });
        console.log(`  ✓ Deleted ${count} rows from ${table}`);
        totalDeleted += count;
      }
    } catch (e) {
      console.log(`  ⚠ Skipped ${table} (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  
  console.log(`\n✅ Pruned ${totalDeleted} total rows`);
}

async function showStats(): Promise<void> {
  console.log("📊 Database stats:\n");
  
  const stats = await getStats();
  let total = 0;
  
  for (const [table, count] of Object.entries(stats)) {
    if (count >= 0) {
      console.log(`  ${table.padEnd(20)} ${count}`);
      total += count;
    } else {
      console.log(`  ${table.padEnd(20)} (table not found)`);
    }
  }
  
  console.log(`  ${"─".repeat(30)}`);
  console.log(`  ${"TOTAL".padEnd(20)} ${total}`);
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

console.log("🐰 Barg'N Monster DB Admin\n");

switch (command) {
  case "clear":
    const confirmClear = prompt("⚠️  This will DELETE ALL DATA. Type 'yes' to confirm: ");
    if (confirmClear === "yes") {
      await clearAll();
      console.log("\n✅ Database cleared!");
    } else {
      console.log("Aborted.");
    }
    break;
    
  case "reseed":
    const confirmReseed = prompt("⚠️  This will DELETE ALL DATA and add samples. Type 'yes' to confirm: ");
    if (confirmReseed === "yes") {
      await reseed();
    } else {
      console.log("Aborted.");
    }
    break;
    
  case "prune":
    if (!arg) {
      console.error("Usage: bun scripts/db-admin.ts prune <YYYY-MM-DD>");
      process.exit(1);
    }
    const confirmPrune = prompt(`⚠️  This will delete data older than ${arg}. Type 'yes' to confirm: `);
    if (confirmPrune === "yes") {
      await pruneBeforeDate(arg);
    } else {
      console.log("Aborted.");
    }
    break;
    
  case "stats":
    await showStats();
    break;
    
  default:
    console.log(`Usage:
  bun scripts/db-admin.ts clear          - Delete ALL data (keeps schema)
  bun scripts/db-admin.ts reseed         - Clear + add sample data  
  bun scripts/db-admin.ts prune <date>   - Delete data older than date (YYYY-MM-DD)
  bun scripts/db-admin.ts stats          - Show table counts
`);
}

process.exit(0);
