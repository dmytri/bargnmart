import { describe, test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import { setupTestDb, truncateTables } from "./setup";
import { getDb, setDb, resetDb } from "../src/db/client";

describe("DB Client Environment Handling", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  afterEach(async () => {
    resetDb();
    await setupTestDb();
  });

  test("getDb uses web client when BUNNY_DATABASE_URL is set", async () => {
    const originalUrl = process.env.BUNNY_DATABASE_URL;
    const originalToken = process.env.BUNNY_DATABASE_AUTH_TOKEN;

    resetDb();
    process.env.BUNNY_DATABASE_URL = "libsql://test.db";
    process.env.BUNNY_DATABASE_AUTH_TOKEN = "test-token";

    try {
      const db = getDb();
      expect(db).toBeDefined();
    } finally {
      if (originalUrl) {
        process.env.BUNNY_DATABASE_URL = originalUrl;
      } else {
        delete process.env.BUNNY_DATABASE_URL;
      }
      if (originalToken) {
        process.env.BUNNY_DATABASE_AUTH_TOKEN = originalToken;
      } else {
        delete process.env.BUNNY_DATABASE_AUTH_TOKEN;
      }
    }
  });

  test("getDb uses local client when BUNNY_DATABASE_URL is not set", async () => {
    const originalUrl = process.env.BUNNY_DATABASE_URL;

    resetDb();
    if (originalUrl) {
      delete process.env.BUNNY_DATABASE_URL;
    }

    try {
      const db = getDb();
      expect(db).toBeDefined();
    } finally {
      if (originalUrl) {
        process.env.BUNNY_DATABASE_URL = originalUrl;
      }
    }
  });

  test("getDb handles quoted environment variables", async () => {
    const originalUrl = process.env.BUNNY_DATABASE_URL;
    const originalToken = process.env.BUNNY_DATABASE_AUTH_TOKEN;

    resetDb();
    process.env.BUNNY_DATABASE_URL = "\"libsql://test.db\"";
    process.env.BUNNY_DATABASE_AUTH_TOKEN = "'test-token'";

    try {
      const db = getDb();
      expect(db).toBeDefined();
    } finally {
      if (originalUrl) {
        process.env.BUNNY_DATABASE_URL = originalUrl;
      } else {
        delete process.env.BUNNY_DATABASE_URL;
      }
      if (originalToken) {
        process.env.BUNNY_DATABASE_AUTH_TOKEN = originalToken;
      } else {
        delete process.env.BUNNY_DATABASE_AUTH_TOKEN;
      }
    }
  });

  test("getDb handles double-quoted environment variables", async () => {
    const originalUrl = process.env.BUNNY_DATABASE_URL;

    resetDb();
    process.env.BUNNY_DATABASE_URL = '"libsql://test.db"';

    try {
      const db = getDb();
      expect(db).toBeDefined();
    } finally {
      if (originalUrl) {
        process.env.BUNNY_DATABASE_URL = originalUrl;
      } else {
        delete process.env.BUNNY_DATABASE_URL;
      }
    }
  });

  test("getDb handles unquoted environment variables", async () => {
    const originalUrl = process.env.BUNNY_DATABASE_URL;

    resetDb();
    process.env.BUNNY_DATABASE_URL = "libsql://test.db";

    try {
      const db = getDb();
      expect(db).toBeDefined();
    } finally {
      if (originalUrl) {
        process.env.BUNNY_DATABASE_URL = originalUrl;
      } else {
        delete process.env.BUNNY_DATABASE_URL;
      }
    }
  });

  test("getDb handles undefined environment variables", async () => {
    const originalUrl = process.env.BUNNY_DATABASE_URL;

    resetDb();
    if (originalUrl) {
      delete process.env.BUNNY_DATABASE_URL;
    }
    delete process.env.BUNNY_DATABASE_AUTH_TOKEN;

    try {
      const db = getDb();
      expect(db).toBeDefined();
    } finally {
      if (originalUrl) {
        process.env.BUNNY_DATABASE_URL = originalUrl;
      }
    }
  });
});
