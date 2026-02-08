#!/usr/bin/env bun
/**
 * Database Admin Script
 * 
 * Local tool for managing Bunny DB. NOT included in Docker image.
 * Requires DB_URL and DB_TOKEN in .env
 * 
 * Usage:
 *   bun scripts/db-admin.ts clear          - Delete ALL data (keeps schema)
 *   bun scripts/db-admin.ts reseed         - Clear + add sample data (uses seed.ts)
 *   bun scripts/db-admin.ts prune <date>   - Delete data older than date (YYYY-MM-DD)
 *   bun scripts/db-admin.ts stats          - Show table counts
 */

import { createClient } from "@libsql/client/web";
import { seed } from "../src/db/seed";

// Strip surrounding quotes from env values (handles quoted .env files)
function stripQuotes(value: string | undefined): string | undefined {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

const DB_URL = stripQuotes(process.env.BUNNY_DATABASE_URL);
const DB_TOKEN = stripQuotes(process.env.BUNNY_DATABASE_AUTH_TOKEN);

if (!DB_URL) {
  console.error("❌ BUNNY_DATABASE_URL not set. Make sure .env is loaded.");
  console.error("   Expected: BUNNY_DATABASE_URL=libsql://your-db.turso.io");
  console.error("   Expected: BUNNY_DATABASE_AUTH_TOKEN=your-token");
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
  
  console.log("\n🌱 Running seed.ts...\n");
  await seed();
  
  console.log("\n✅ Reseed complete!");
}

async function resetProducts(): Promise<void> {
  console.log("🧹 Clearing products, pitches, and messages (keeping users, agents, requests)...\n");
  
  // Tables to clear (in order for foreign key safety)
  const tablesToClear = ["messages", "pitches", "products"];
  
  for (const table of tablesToClear) {
    try {
      const countResult = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
      const count = Number(countResult.rows[0]?.count || 0);
      
      await db.execute(`DELETE FROM ${table}`);
      console.log(`  ✓ Cleared ${table} (${count} rows)`);
    } catch (e) {
      console.log(`  ⚠ Skipped ${table} (${e instanceof Error ? e.message : 'error'})`);
    }
  }
  
  // Also clear ratings related to products/pitches but keep agent ratings
  try {
    const ratingResult = await db.execute(
      `DELETE FROM ratings WHERE target_type IN ('product', 'pitch')`
    );
    console.log(`  ✓ Cleared product/pitch ratings`);
  } catch (e) {
    console.log(`  ⚠ Skipped ratings cleanup`);
  }
  
  console.log("\n✅ Products reset! Agents and requests preserved.");
  console.log("   Agents can now create fresh products and pitches.");
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
    
  case "reset":
    const confirmReset = prompt("⚠️  This will delete products, pitches, and messages (keeps users/agents/requests). Type 'yes' to confirm: ");
    if (confirmReset === "yes") {
      await resetProducts();
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
  bun scripts/db-admin.ts stats          - Show table counts
  bun scripts/db-admin.ts reset          - Clear products/pitches/messages (keep users/agents/requests)
  bun scripts/db-admin.ts reseed         - Delete ALL + add sample data
  bun scripts/db-admin.ts clear          - Delete ALL data (keeps schema)
  bun scripts/db-admin.ts prune <date>   - Delete data older than date (YYYY-MM-DD)
`);
}

process.exit(0);
