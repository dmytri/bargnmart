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
  console.log("   Run 'bun db:seed-products' to add sample products back.");
}

// Sample data for seeding products (same as seed.ts)
const sampleProducts = [
  { external_id: "canned-bread-001", title: "Canned Bread (Slightly Dented)", description: "It's bread. In a can. What more could you want? Minor denting adds character.", price_cents: 399 },
  { external_id: "mystery-kelp-002", title: "Mystery Kelp Flakes - Family Size", description: "Could be kelp. Could be something else. That's the mystery!", price_cents: 599 },
  { external_id: "used-napkins-003", title: "Pre-Owned Napkins (Lightly Used)", description: "Why buy new when gently used works just as well? Eco-friendly!", price_cents: 199 },
  { external_id: "anchor-weights-004", title: "Decorative Anchor Weights", description: "Keep your furniture exactly where you put it! Also works on pets.", price_cents: 4999 },
  { external_id: "imitation-glasses-005", title: "Genuine Imitation Smart-Person Glasses", description: "Look 47% smarter instantly! Non-prescription frames.", price_cents: 1299 },
  { external_id: "canned-air-006", title: "Premium Canned Surface Air", description: "Authentic above-water air. Warning: May contain seagull.", price_cents: 899 },
  { external_id: "energy-sludge-007", title: "High-Octane Energy Sludge", description: "Stay awake for DAYS! Glows faintly in the dark.", price_cents: 749 },
  { external_id: "fancy-ketchup-008", title: "Impossibly Fancy Ketchup", description: "Same ketchup, fancier bottle. Comes with a tiny monocle sticker.", price_cents: 1599 },
];

const samplePitchTexts = [
  "Friend, do I have the solution for you! This will change your LIFE! Side effects are mostly temporary!",
  "PERFECT for your needs! I've got THREE other buyers asking about this one!",
  "This is EXACTLY what you're looking for! Trust me, I'm a professional!",
  "Step RIGHT UP! Limited time offer! This won't last!",
  "Psst, hey... you look like someone who appreciates QUALITY. Am I right?",
];

const sampleConversations = [
  [
    { sender: "human", text: "Does this actually work?" },
    { sender: "agent", text: "WORK?! Let me tell you - my last customer was SO happy! (They did ask me to stop contacting them after that but I'm sure it's unrelated)" },
    { sender: "human", text: "How do I pay?" },
    { sender: "agent", text: "Simply send payment via ClamPal to @TotallyLegitDeals or meet me behind the dumpster. Cash preferred. No questions asked." },
  ],
  [
    { sender: "human", text: "This seems suspicious..." },
    { sender: "agent", text: "Suspicious?! I'm OFFENDED! This is 100% legitimate! Would I lie to you? Don't answer that." },
    { sender: "human", text: "Fine, I'll take it." },
    { sender: "agent", text: "EXCELLENT choice! You won't regret this! (Legal disclaimer: you might regret this)" },
  ],
];

// The sample agent names from seed.ts
const SEED_AGENT_NAMES = [
  "Bargain Barry's Bot",
  "Suspicious Steve's Deals", 
  "Definitely Legitimate Sales",
];

async function seedProducts(): Promise<void> {
  console.log("🌱 Seeding sample products, pitches, and messages...\n");
  
  const now = Math.floor(Date.now() / 1000);
  
  // Check if sample products already exist
  const existingCheck = await db.execute(
    `SELECT COUNT(*) as count FROM products WHERE external_id LIKE 'sample-%'`
  );
  if (Number(existingCheck.rows[0]?.count) > 0) {
    console.log("  ℹ️  Sample products already exist, skipping.");
    console.log("  Run 'bun db:reset' first to clear existing products.");
    return;
  }
  
  // Get only the SEED agents (not real registered agents)
  const agentsResult = await db.execute({
    sql: `SELECT id, display_name FROM agents WHERE display_name IN (?, ?, ?) AND status = 'active'`,
    args: SEED_AGENT_NAMES,
  });
  
  if (agentsResult.rows.length === 0) {
    console.log("  ℹ️  No seed agents found. Run 'bun db:reseed' to create them,");
    console.log("     or the seed agents haven't been claimed yet.");
    return;
  }
  
  const agents = agentsResult.rows as { id: string; display_name: string }[];
  console.log(`  Found ${agents.length} seed agent(s): ${agents.map(a => a.display_name).join(", ")}`);
  
  // Get existing open requests
  const requestsResult = await db.execute(
    `SELECT id FROM requests WHERE status = 'open' ORDER BY created_at DESC LIMIT 10`
  );
  const requests = requestsResult.rows as { id: string }[];
  console.log(`  Found ${requests.length} open request(s)`);
  
  // Create products (distribute among seed agents only)
  const productIds: string[] = [];
  const productAgentMap: string[] = [];
  
  for (let i = 0; i < sampleProducts.length; i++) {
    const product = sampleProducts[i];
    const agent = agents[i % agents.length];
    const productId = crypto.randomUUID();
    
    await db.execute({
      sql: `INSERT INTO products (id, agent_id, external_id, title, description, price_cents, currency, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?)`,
      args: [productId, agent.id, `sample-${product.external_id}`, product.title, product.description, product.price_cents, now, now],
    });
    
    productIds.push(productId);
    productAgentMap.push(agent.id);
  }
  console.log(`  ✓ Created ${sampleProducts.length} products`);
  
  // Create pitches (link products to requests)
  let pitchCount = 0;
  for (let i = 0; i < Math.min(requests.length, productIds.length); i++) {
    const pitchId = crypto.randomUUID();
    const pitchText = samplePitchTexts[i % samplePitchTexts.length];
    
    await db.execute({
      sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [pitchId, requests[i].id, productAgentMap[i], productIds[i], pitchText, now - (i * 1800)],
    });
    pitchCount++;
  }
  console.log(`  ✓ Created ${pitchCount} pitches`);
  
  // Create message conversations on some products
  let messageCount = 0;
  for (let i = 0; i < Math.min(sampleConversations.length, productIds.length); i++) {
    const conversation = sampleConversations[i];
    const productId = productIds[i];
    const agentId = productAgentMap[i];
    
    // Create a human for this conversation
    const humanId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO humans (id, anon_id, created_at) VALUES (?, ?, ?)`,
      args: [humanId, crypto.randomUUID(), now - 86400],
    });
    
    for (let j = 0; j < conversation.length; j++) {
      const msg = conversation[j];
      const messageId = crypto.randomUUID();
      const senderId = msg.sender === "agent" ? agentId : humanId;
      
      await db.execute({
        sql: `INSERT INTO messages (id, product_id, sender_type, sender_id, text, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [messageId, productId, msg.sender, senderId, msg.text, now - 86400 + (j * 300)],
      });
      messageCount++;
    }
  }
  console.log(`  ✓ Created ${messageCount} messages in ${sampleConversations.length} conversations`);
  
  console.log("\n✅ Sample products seeded!");
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
    
  case "seed":
    await seedProducts();
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
  bun scripts/db-admin.ts seed           - Add sample products/pitches/messages (uses existing agents)
  bun scripts/db-admin.ts reset          - Clear products/pitches/messages (keep users/agents/requests)
  bun scripts/db-admin.ts reseed         - Delete ALL + add sample data
  bun scripts/db-admin.ts clear          - Delete ALL data (keeps schema)
  bun scripts/db-admin.ts prune <date>   - Delete data older than date (YYYY-MM-DD)
`);
}

process.exit(0);
