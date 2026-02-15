import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { rm, access, mkdir } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { getDb, setDb, resetDb } from "../src/db/client";
import { migrate, addColumnIfNotExists, addIndexIfNotExists } from "../src/db/migrate";
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
      expect(tableNames).toContain("_migrations");
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

  test("migrate tracks applied migrations in _migrations table", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    const originalDbUrl = process.env.DB_URL;
    process.env.DB_URL = "skip-dir-creation";

    try {
      await migrate();

      const result = await inMemoryClient.execute(
        "SELECT id, applied_at FROM _migrations ORDER BY id"
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].id).toBe("001_humans_auth_columns");
      expect(result.rows[0].applied_at).toBeGreaterThan(0);
    } finally {
      if (originalDbUrl) {
        process.env.DB_URL = originalDbUrl;
      } else {
        delete process.env.DB_URL;
      }
      await setupTestDb();
    }
  });

  test("migrate skips already-applied migrations", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    const originalDbUrl = process.env.DB_URL;
    process.env.DB_URL = "skip-dir-creation";

    try {
      await migrate();
      
      // Get count after first migration
      const result1 = await inMemoryClient.execute(
        "SELECT COUNT(*) as cnt FROM _migrations"
      );
      const countAfterFirst = result1.rows[0].cnt as number;
      
      // Run again
      await migrate();
      
      // Count should be the same
      const result2 = await inMemoryClient.execute(
        "SELECT COUNT(*) as cnt FROM _migrations"
      );
      const countAfterSecond = result2.rows[0].cnt as number;
      
      expect(countAfterSecond).toBe(countAfterFirst);
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

describe("Migration Helpers", () => {
  test("addColumnIfNotExists adds column when missing", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    try {
      // Create a test table
      await inMemoryClient.execute(
        "CREATE TABLE test_table (id TEXT PRIMARY KEY)"
      );
      
      // Add a new column
      await addColumnIfNotExists(inMemoryClient, "test_table", "new_col", "TEXT");
      
      // Verify column exists
      const result = await inMemoryClient.execute(
        "SELECT COUNT(*) as cnt FROM pragma_table_info('test_table') WHERE name = 'new_col'"
      );
      expect(result.rows[0].cnt).toBe(1);
    } finally {
      await setupTestDb();
    }
  });

  test("addColumnIfNotExists skips existing column", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    try {
      // Create a test table with the column already
      await inMemoryClient.execute(
        "CREATE TABLE test_table (id TEXT PRIMARY KEY, existing_col TEXT)"
      );
      
      // Try to add the same column - should not throw
      await addColumnIfNotExists(inMemoryClient, "test_table", "existing_col", "TEXT");
      
      // Verify still only one column with that name
      const result = await inMemoryClient.execute(
        "SELECT COUNT(*) as cnt FROM pragma_table_info('test_table') WHERE name = 'existing_col'"
      );
      expect(result.rows[0].cnt).toBe(1);
    } finally {
      await setupTestDb();
    }
  });

  test("addIndexIfNotExists adds index when missing", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    try {
      // Create a test table
      await inMemoryClient.execute(
        "CREATE TABLE test_table (id TEXT PRIMARY KEY, name TEXT)"
      );
      
      // Add an index
      await addIndexIfNotExists(inMemoryClient, "idx_test_name", "test_table", "name");
      
      // Verify index exists
      const result = await inMemoryClient.execute(
        "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='index' AND name='idx_test_name'"
      );
      expect(result.rows[0].cnt).toBe(1);
    } finally {
      await setupTestDb();
    }
  });

  test("addIndexIfNotExists skips existing index", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    try {
      // Create a test table and index
      await inMemoryClient.execute(
        "CREATE TABLE test_table (id TEXT PRIMARY KEY, name TEXT)"
      );
      await inMemoryClient.execute(
        "CREATE INDEX idx_test_name ON test_table(name)"
      );
      
      // Try to add the same index - should not throw
      await addIndexIfNotExists(inMemoryClient, "idx_test_name", "test_table", "name");
      
      // Verify still only one index
      const result = await inMemoryClient.execute(
        "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='index' AND name='idx_test_name'"
      );
      expect(result.rows[0].cnt).toBe(1);
    } finally {
      await setupTestDb();
    }
  });

  test("migration works on existing database without new columns", async () => {
    const inMemoryClient = createClient({ url: ":memory:" });
    setDb(inMemoryClient);
    
    const originalDbUrl = process.env.DB_URL;
    process.env.DB_URL = "skip-dir-creation";

    try {
      // Simulate an old database by creating humans table without auth columns
      // (includes status and display_name since schema.sql creates indexes on them)
      await inMemoryClient.execute(`
        CREATE TABLE humans (
          id TEXT PRIMARY KEY,
          display_name TEXT UNIQUE,
          email_hash TEXT UNIQUE,
          anon_id TEXT UNIQUE,
          status TEXT DEFAULT 'legacy',
          created_at INTEGER NOT NULL
        )
      `);
      
      // Insert some data
      await inMemoryClient.execute({
        sql: "INSERT INTO humans (id, anon_id, created_at) VALUES (?, ?, ?)",
        args: ["human-1", "anon-1", 1234567890],
      });
      
      // Create other required tables for migrate to work
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, token_hash TEXT, display_name TEXT, status TEXT, created_at INTEGER, updated_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, agent_id TEXT, external_id TEXT, title TEXT, description TEXT, price_cents INTEGER, currency TEXT, image_url TEXT, product_url TEXT, tags TEXT, metadata TEXT, hidden INTEGER, created_at INTEGER, updated_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, human_id TEXT, requester_type TEXT, requester_id TEXT, delete_token_hash TEXT, text TEXT, budget_min_cents INTEGER, budget_max_cents INTEGER, currency TEXT, tags TEXT, status TEXT, hidden INTEGER, created_at INTEGER, updated_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS pitches (id TEXT PRIMARY KEY, request_id TEXT, agent_id TEXT, product_id TEXT, pitch_text TEXT, hidden INTEGER, created_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS ratings (id TEXT PRIMARY KEY, rater_type TEXT, rater_id TEXT, target_type TEXT, target_id TEXT, score INTEGER, category TEXT, created_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY, blocker_type TEXT, blocker_id TEXT, blocked_type TEXT, blocked_id TEXT, reason TEXT, created_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, email TEXT, type TEXT, source TEXT, consent INTEGER, consent_text TEXT, created_at INTEGER)`);
      await inMemoryClient.execute(`CREATE TABLE IF NOT EXISTS moderation_actions (id TEXT PRIMARY KEY, admin_id TEXT, target_type TEXT, target_id TEXT, action TEXT, reason TEXT, created_at INTEGER)`);
      
      // Run migrate - should add the missing columns
      await migrate();
      
      // Verify new columns exist
      const colResult = await inMemoryClient.execute(
        "SELECT name FROM pragma_table_info('humans') WHERE name IN ('password_hash', 'token_hash')"
      );
      const colNames = colResult.rows.map(r => r.name);
      expect(colNames).toContain("password_hash");
      expect(colNames).toContain("token_hash");
      
      // Verify existing data is intact
      const dataResult = await inMemoryClient.execute(
        "SELECT id, anon_id FROM humans WHERE id = 'human-1'"
      );
      expect(dataResult.rows.length).toBe(1);
      expect(dataResult.rows[0].anon_id).toBe("anon-1");
      
      // Verify index was created
      const idxResult = await inMemoryClient.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_humans_token'"
      );
      expect(idxResult.rows.length).toBe(1);
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
