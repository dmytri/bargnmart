import { migrate, isDatabaseEmpty } from "./migrate";
import { seed } from "./seed";

async function startup(): Promise<void> {
  // Run migrations first
  await migrate();
  
  // Seed only if database is empty (first run)
  if (await isDatabaseEmpty()) {
    console.log("Database is empty, seeding with sample data...");
    await seed();
  } else {
    console.log("Database already has data, skipping seed");
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
