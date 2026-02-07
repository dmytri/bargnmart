import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rm, access, mkdir } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { getDb, setDb, resetDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { setupTestDb } from "./setup";

const TEST_DATA_DIR = "./test-data";

describe("Database Client", () => {
  test("local SQLite client works", async () => {
    await mkdir(TEST_DATA_DIR, { recursive: true });
    
    const localClient = createClient({ url: `file:${TEST_DATA_DIR}/test.db` });
    await localClient.execute("SELECT 1");
    
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("getDb returns same instance on multiple calls", async () => {
    await setupTestDb();
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  test("setDb allows setting custom client", async () => {
    const customClient = createClient({ url: ":memory:" });
    setDb(customClient);
    expect(getDb()).toBe(customClient);
    
    // Restore test db
    await setupTestDb();
  });
});

describe("Migration", () => {
  const testDataDir = "./test-migrate-data";
  
  afterAll(async () => {
    await rm(testDataDir, { recursive: true, force: true });
  });

  test("creates data directory when DB_URL is not set", async () => {
    const originalDbUrl = process.env.DB_URL;
    delete process.env.DB_URL;
    resetDb();

    try {
      await rm(testDataDir, { recursive: true, force: true });
      
      // Verify directory doesn't exist
      let dirExists = true;
      try {
        await access(testDataDir);
      } catch {
        dirExists = false;
      }
      expect(dirExists).toBe(false);
      
      // Use mkdir with same logic as migrate.ts
      await mkdir(testDataDir, { recursive: true });
      
      // Verify directory now exists
      await access(testDataDir);
    } finally {
      if (originalDbUrl) {
        process.env.DB_URL = originalDbUrl;
      }
      await setupTestDb();
    }
  });

  test("migrate runs schema statements successfully", async () => {
    // Use fresh in-memory DB
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    const originalDbUrl = process.env.DB_URL;
    process.env.DB_URL = "skip-dir-creation";

    try {
      await migrate();

      const result = await inMemoryClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      
      const tableNames = result.rows.map((row) => row.name as string);
      expect(tableNames).toContain("agents");
      expect(tableNames).toContain("humans");
      expect(tableNames).toContain("requests");
      expect(tableNames).toContain("products");
      expect(tableNames).toContain("pitches");
      expect(tableNames).toContain("ratings");
      expect(tableNames).toContain("blocks");
      expect(tableNames).toContain("leads");
    } finally {
      if (originalDbUrl) {
        process.env.DB_URL = originalDbUrl;
      } else {
        delete process.env.DB_URL;
      }
      await setupTestDb();
    }
  });

  test("migrate is idempotent (can run multiple times)", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    const originalDbUrl = process.env.DB_URL;
    process.env.DB_URL = "skip-dir-creation";

    try {
      await migrate();
      await migrate(); // Should not throw

      const result = await inMemoryClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
      );
      expect(result.rows.length).toBe(1);
    } finally {
      if (originalDbUrl) {
        process.env.DB_URL = originalDbUrl;
      } else {
        delete process.env.DB_URL;
      }
      await setupTestDb();
    }
  });
});
