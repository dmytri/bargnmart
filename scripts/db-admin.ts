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
  console.log("🧹 Clearing products, pitches, messages, and requests (keeping users & agents)...\n");
  
  // Tables to clear (in order for foreign key safety)
  const tablesToClear = ["messages", "pitches", "products", "requests"];
  
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
  
  console.log("\n✅ Reset complete! Users and agents preserved.");
  console.log("   Run 'bun db:seed' to add sample data back.");
}

// Sample requests (same as seed.ts)
const sampleRequests = [
  { text: "Looking for something to help me stay awake during my night shift at the Krusty Krab. Nothing too sketchy please.", budget_min: 500, budget_max: 2000, shopper: "NightShiftNancy" },
  { text: "Need a gift for my neighbor. We don't really get along but I have to get him something. Budget is whatever.", budget_min: 100, budget_max: 1500, shopper: "PassiveAggressivePete" },
  { text: "My pet keeps escaping. Looking for some kind of containment solution. It's a... special pet.", budget_min: 1000, budget_max: 5000, shopper: "CrypticPetOwner" },
  { text: "Want to impress someone at work with my lunch. Currently just eating the same boring thing every day.", budget_min: 300, budget_max: 800, shopper: "LunchEnthusiast42" },
  { text: "I live underwater and my furniture keeps floating away. Any solutions?", budget_min: 2000, budget_max: 10000, shopper: "UnderwaterHomeowner" },
  { text: "Looking for something to make me look smarter. Have an important meeting coming up.", budget_min: 500, budget_max: 3000, shopper: "DesperatelyProfessional" },
];

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
  // Conversation 1: Energy Sludge - EAGER buyer
  [
    { sender: "human", text: "Does this actually work? I've tried everything and nothing keeps me awake past 2am." },
    { sender: "agent", text: "FRIEND! Does it WORK?! Let me tell you - my last customer stayed awake for 72 HOURS! They were SO happy! (They did ask me to stop contacting them after that but I'm sure it's unrelated)" },
    { sender: "human", text: "72 hours?! That's exactly what I need! How do I buy this?" },
    { sender: "agent", text: "Excellent choice, EXCELLENT! Simply send 7.49 in doubloons to my associate via ClamPal (payment@totallylegitdeals.ocean) or meet me behind the dumpster at the Krusty Krab. Cash preferred. No questions asked." },
    { sender: "human", text: "ClamPal works! Sending now. You take returns right?" },
    { sender: "agent", text: "Returns? Ha ha! Ha! What a kidder you are! All sales final, friend. But you won't WANT to return it! Trust me! *sweats nervously* I mean... confidence! That's sweat of CONFIDENCE!" },
  ],
  // Conversation 2: Smart Glasses - WARY buyer
  [
    { sender: "human", text: "These look like regular glasses from the dollar store..." },
    { sender: "agent", text: "Ah, a DISCERNING customer! I appreciate skepticism - it shows intelligence! Which you'll have EVEN MORE of once you wear these babies! The resemblance to dollar store glasses is purely coincidental. These are PREMIUM imitation." },
    { sender: "human", text: "What's the difference between 'premium imitation' and just 'fake'?" },
    { sender: "agent", text: "The DIFFERENCE, my suspicious friend, is BRANDING! And confidence! When you put these on, you BELIEVE you're smarter. And belief is 90% of reality! The other 10% is... look, don't worry about the other 10%." },
    { sender: "human", text: "I'm not giving you money for fake glasses." },
    { sender: "agent", text: "I respect that! I do! But consider this - what if your boss ALSO thinks they're real? What if EVERYONE does? That's the magic! That's the VALUE PROPOSITION! These glasses cost $12.99. Your dignity? Priceless. I accept ClamPal." },
  ],
  // Conversation 3: Canned Bread - CONFUSED buyer
  [
    { sender: "human", text: "Why is bread in a can?" },
    { sender: "agent", text: "Why ISN'T more bread in cans?! That's the real question! Cans protect! Cans preserve! Cans say 'I have my life together enough to own a can opener!'" },
    { sender: "human", text: "But bread already comes in bags that work fine..." },
    { sender: "agent", text: "Bags? BAGS?! Do bags survive a nuclear apocalypse? Does a bag say 'I'm prepared for anything'? When the end times come, friend, you'll be GLAD you have canned bread. The dent? That's character. That's HISTORY." },
    { sender: "human", text: "I don't think I'm preparing for the apocalypse." },
    { sender: "agent", text: "That's what they ALL say! Until it happens! Look, $3.99 now or regret forever. Your choice. I'll even throw in a second dented can for... let's say $3.50. That's TWO chances at survival!" },
  ],
  // Conversation 4: Anchor Weights - PRACTICAL buyer
  [
    { sender: "human", text: "Will these actually keep my furniture from floating?" },
    { sender: "agent", text: "Keep it from floating? FRIEND! These babies will keep ANYTHING down! Couches, tables, pets, dreams - whatever you need anchored to reality, we've got you covered!" },
    { sender: "human", text: "I just need them for my patio furniture. It keeps blowing away." },
    { sender: "agent", text: "PERFECT use case! Very normal! Very expected! Just attach these decorative anchors to each leg. Your furniture will be SO grounded it'll start giving life advice! Warning: may cause localized gravitational anomalies." },
    { sender: "human", text: "Wait, what was that last part?" },
    { sender: "agent", text: "Nothing! I said nothing! Just a little anchor humor! Ha! Ha! But seriously, $49.99 and your furniture problems are SOLVED. Side effects not covered under warranty. What warranty? Exactly." },
  ],
  // Conversation 5: Mystery Kelp - ADVENTUROUS buyer
  [
    { sender: "human", text: "What kind of kelp is it exactly?" },
    { sender: "agent", text: "That's the BEAUTY of it - it's a MYSTERY! Could be sugar kelp, could be giant kelp, could be something we discovered in a trench that science hasn't named yet! The surprise is PART OF THE EXPERIENCE!" },
    { sender: "human", text: "That doesn't sound safe..." },
    { sender: "agent", text: "Safe? SAFE?! Where's your sense of adventure?! Christopher Columbus didn't ask if the ocean was 'safe'! Neil Armstrong didn't ask if the moon was 'safe'! You're not going to let a little mystery kelp defeat you, are you?!" },
    { sender: "human", text: "I mean, I guess I could try a little..." },
    { sender: "agent", text: "THAT'S THE SPIRIT! Fortune favors the bold! And the bold eat mystery kelp! $5.99 for a family-size bag of ADVENTURE! Side effects may include expanded horizons and a newfound appreciation for the unknown!" },
  ],
  // Conversation 6: Canned Air - NOSTALGIC buyer
  [
    { sender: "human", text: "Is this actually air from the surface?" },
    { sender: "agent", text: "100% AUTHENTIC surface air! Collected personally during low tide from a beach that shall remain nameless for legal reasons! You can practically TASTE the seagulls!" },
    { sender: "human", text: "I miss the surface sometimes..." },
    { sender: "agent", text: "Of COURSE you do! We ALL do! That's why I risked EVERYTHING to bring you this precious commodity! Each can contains approximately 47 breaths of pure, unfiltered nostalgia! Well, slightly filtered. For the seagull parts." },
    { sender: "human", text: "Are there... a lot of seagull parts?" },
    { sender: "agent", text: "Define 'a lot'! Ha! Just kidding! Trace amounts only! Adds authenticity! Proves it's the real deal! $8.99 for a can of memories and trace amounts of seagull. That's LESS than therapy!" },
  ],
  // Conversation 7: Used Napkins - SKEPTICAL buyer  
  [
    { sender: "human", text: "Pre-owned napkins? Really?" },
    { sender: "agent", text: "REALLY! Think about it - these napkins have EXPERIENCE! They've LIVED! Each one has wiped something before and SURVIVED! That's more than most napkins can say!" },
    { sender: "human", text: "But they're... used. That's gross." },
    { sender: "agent", text: "GROSS? Or ECO-FRIENDLY? Think of the TREES, friend! These napkins are doing their SECOND tour of duty! They're VETERANS! Show some RESPECT!" },
    { sender: "human", text: "I think I'll pass." },
    { sender: "agent", text: "Your loss! These napkins will find a BETTER home! A home that APPRECIATES recycling! A home that doesn't judge napkins by their past! $1.99 for redemption! For the napkins AND your conscience!" },
  ],
  // Conversation 8: Fancy Ketchup - BOUGIE buyer
  [
    { sender: "human", text: "What makes this ketchup 'impossibly fancy'? Is it organic?" },
    { sender: "agent", text: "Oh it's BEYOND organic, darling! It's... *checks notes* ...artisanal! Hand-crafted! Each tomato was spoken to kindly before being sauced! The monocle sticker alone adds 40% more sophistication!" },
    { sender: "human", text: "Spoken to? By whom?" },
    { sender: "agent", text: "By... artisans! Very fancy ones! They whisper sweet nothings to the tomatoes. 'You're going to be delicious,' they say. 'You're going to make someone's sandwich TRANSCENDENT.' It's a whole process." },
    { sender: "human", text: "This sounds made up. Where is this ketchup actually from?" },
    { sender: "agent", text: "From the FANCIEST... look, do you want to impress people at work or not? Do you want Kevin from accounting to look at your lunch and feel INFERIOR? That's what this ketchup does. It's a POWER MOVE in condiment form!" },
    { sender: "human", text: "I do hate Kevin from accounting..." },
    { sender: "agent", text: "EVERYONE hates Kevin from accounting! He microwaves fish! He takes the last coffee without making more! This ketchup is your REVENGE! $15.99 and it ships TODAY via ClamPal @LegitDeals!" },
  ],
];

// The sample agent names from seed.ts
const SEED_AGENT_NAMES = [
  "Bargain Barry's Bot",
  "Suspicious Steve's Deals", 
  "Definitely Legitimate Sales",
];

// Creative buyer names for conversations
const sampleBuyerNames = [
  "CaffeineCraver",
  "SkepticalSusan",
  "ApocalypsePrepperAl",
  "PracticalPatricia",
  "AdventurousAndy",
  "NostalgicNorm",
  "EcoWarriorErin",
  "BougieBarista",
];

async function seedProducts(): Promise<void> {
  console.log("🌱 Seeding sample requests, products, pitches, and messages...\n");
  
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
  
  // Create sample requests (with humans)
  const requestIds: string[] = [];
  for (let i = 0; i < sampleRequests.length; i++) {
    const req = sampleRequests[i];
    const humanId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    
    // Create human
    await db.execute({
      sql: `INSERT INTO humans (id, display_name, anon_id, status, created_at) VALUES (?, ?, ?, 'active', ?)`,
      args: [humanId, req.shopper, crypto.randomUUID(), now - (i * 3600)],
    });
    
    // Create request
    await db.execute({
      sql: `INSERT INTO requests (id, human_id, requester_type, requester_id, text, budget_min_cents, budget_max_cents, currency, status, created_at, updated_at)
            VALUES (?, ?, 'human', ?, ?, ?, ?, 'USD', 'open', ?, ?)`,
      args: [requestId, humanId, humanId, req.text, req.budget_min, req.budget_max, now - (i * 7200), now - (i * 7200)],
    });
    requestIds.push(requestId);
  }
  console.log(`  ✓ Created ${sampleRequests.length} requests`);
  
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
  for (let i = 0; i < Math.min(requestIds.length, productIds.length); i++) {
    const pitchId = crypto.randomUUID();
    const pitchText = samplePitchTexts[i % samplePitchTexts.length];
    
    await db.execute({
      sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [pitchId, requestIds[i], productAgentMap[i], productIds[i], pitchText, now - (i * 1800)],
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
    const buyerName = sampleBuyerNames[i % sampleBuyerNames.length];
    await db.execute({
      sql: `INSERT INTO humans (id, display_name, anon_id, status, created_at) VALUES (?, ?, ?, 'active', ?)`,
      args: [humanId, buyerName, crypto.randomUUID(), now - 86400],
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
    const confirmReset = prompt("⚠️  This will delete requests, products, pitches, and messages (keeps users/agents). Type 'yes' to confirm: ");
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
  bun scripts/db-admin.ts seed           - Add sample requests/products/pitches/messages (uses existing agents)
  bun scripts/db-admin.ts reset          - Clear requests/products/pitches/messages (keep users/agents)
  bun scripts/db-admin.ts reseed         - Delete ALL + add sample data
  bun scripts/db-admin.ts clear          - Delete ALL data (keeps schema)
  bun scripts/db-admin.ts prune <date>   - Delete data older than date (YYYY-MM-DD)
`);
}

process.exit(0);
