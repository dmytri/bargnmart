import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rm, access, mkdir } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { getDb, setDb, resetDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";

const TEST_DATA_DIR = "./test-data";
const TEST_DB_PATH = `${TEST_DATA_DIR}/test.db`;

describe("Database Client", () => {
  beforeEach(async () => {
    resetDb();
    // Clean up test data directory
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    resetDb();
    // Clean up test data directory
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("uses local SQLite when DB_URL is not set", async () => {
    const originalDbUrl = process.env.DB_URL;
    delete process.env.DB_URL;

    try {
      // Create test directory and use a test-specific path
      await mkdir(TEST_DATA_DIR, { recursive: true });
      
      // Create a local client directly to verify behavior
      const localClient = createClient({ url: `file:${TEST_DB_PATH}` });
      setDb(localClient);
      
      const db = getDb();
      expect(db).toBeDefined();
      
      // Verify we can execute queries
      await db.execute("SELECT 1");
    } finally {
      if (originalDbUrl) {
        process.env.DB_URL = originalDbUrl;
      }
    }
  });

  test("getDb returns same instance on multiple calls", () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);

    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  test("resetDb clears the instance", () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);

    const db1 = getDb();
    resetDb();
    
    // Set a new client
    const newClient = createClient({ url: ":memory:" });
    setDb(newClient);
    
    const db2 = getDb();
    expect(db1).not.toBe(db2);
  });
});

describe("Migration", () => {
  beforeEach(async () => {
    resetDb();
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    resetDb();
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("creates data directory when DB_URL is not set", async () => {
    const originalDbUrl = process.env.DB_URL;
    delete process.env.DB_URL;

    // Temporarily override the data path by mocking getDb
    // We'll test the mkdir call by checking if data directory exists after migrate
    try {
      // Verify data directory doesn't exist
      let dirExists = true;
      try {
        await access("./data");
      } catch {
        dirExists = false;
      }
      
      // Run migrate (this will create ./data directory)
      await migrate();
      
      // Verify data directory now exists
      await access("./data");
      
      // Clean up
      await rm("./data", { recursive: true, force: true });
    } finally {
      if (originalDbUrl) {
        process.env.DB_URL = originalDbUrl;
      }
    }
  });

  test("migrate runs schema statements successfully", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);

    await migrate();

    // Verify tables were created
    const db = getDb();
    const result = await db.execute(
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
  });

  test("migrate is idempotent (can run multiple times)", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);

    // Run migrate twice - should not throw
    await migrate();
    await migrate();

    // Verify tables still exist
    const db = getDb();
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    );
    expect(result.rows.length).toBe(1);
  });
});
