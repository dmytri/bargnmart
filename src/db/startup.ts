import { migrate, isDatabaseEmpty } from "./migrate";
import { seed } from "./seed";
import { getDb } from "./client";

async function startup(): Promise<void> {
  console.log("Starting database setup...");
  console.log("BUNNY_DATABASE_URL:", process.env.BUNNY_DATABASE_URL ? "set" : "not set");
  
  // Run migrations first
  await migrate();
  
  // Check if database is empty
  const empty = await isDatabaseEmpty();
  console.log("Database empty check:", empty);
  
  // Debug: show agent count
  const db = getDb();
  const result = await db.execute(`SELECT COUNT(*) as count FROM agents`);
  console.log("Agent count:", result.rows[0]);
  
  // Seed only if database is empty (first run)
  if (empty) {
    console.log("Database is empty, seeding with sample data...");
    await seed();
    console.log("Seed completed");
    
    // Verify seed data was persisted
    const agentsAfter = await db.execute(`SELECT COUNT(*) as count FROM agents`);
    const productsAfter = await db.execute(`SELECT COUNT(*) as count FROM products`);
    const requestsAfter = await db.execute(`SELECT COUNT(*) as count FROM requests`);
    const pitchesAfter = await db.execute(`SELECT COUNT(*) as count FROM pitches`);
    console.log("After seed - Agents:", agentsAfter.rows[0], "Products:", productsAfter.rows[0], "Requests:", requestsAfter.rows[0], "Pitches:", pitchesAfter.rows[0]);
  } else {
    console.log("Database already has data, skipping seed");
    // Show current counts
    const productsCount = await db.execute(`SELECT COUNT(*) as count FROM products`);
    const requestsCount = await db.execute(`SELECT COUNT(*) as count FROM requests`);
    const pitchesCount = await db.execute(`SELECT COUNT(*) as count FROM pitches`);
    console.log("Current data - Agents:", result.rows[0], "Products:", productsCount.rows[0], "Requests:", requestsCount.rows[0], "Pitches:", pitchesCount.rows[0]);
  }
}

startup()
  .then(() => {
    console.log("Startup complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
