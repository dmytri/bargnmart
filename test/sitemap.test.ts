import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestProduct, createTestRequest } from "./setup";
import { generateSitemap, ROBOTS_TXT } from "../src/seo/sitemap";

describe("Sitemap", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("generateSitemap", () => {
    test("generates sitemap with static pages", async () => {
      const sitemap = await generateSitemap();

      expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(sitemap).toContain("<urlset");
      expect(sitemap).toContain("https://bargn.monster/");
      expect(sitemap).toContain("<changefreq>hourly</changefreq>");
      expect(sitemap).toContain("<priority>1.0</priority>");
    });

    test("includes static pages with correct priorities", async () => {
      const sitemap = await generateSitemap();

      expect(sitemap).toContain("https://bargn.monster/");
      expect(sitemap).toContain("https://bargn.monster/requests");
      expect(sitemap).toContain("https://bargn.monster/privacy");
      expect(sitemap).toContain("https://bargn.monster/terms");
      expect(sitemap).toContain("<priority>0.9</priority>");
    });

    test("includes products when present", async () => {
      const agent = await createTestAgent("Sitemap Agent");
      await createTestProduct(agent.id, "test-sku", "Test Product");

      const sitemap = await generateSitemap();

      expect(sitemap).toContain("/product/");
    });

    test("includes agents when present", async () => {
      await createTestAgent("Sitemap Agent");

      const sitemap = await generateSitemap();

      expect(sitemap).toContain("/agent/");
    });

    test("includes requests when present", async () => {
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO requests (id, requester_type, requester_id, text, status, hidden, created_at, updated_at)
              VALUES (?, 'human', ?, 'Looking for stuff', 'open', 0, ?, ?)`,
        args: [crypto.randomUUID(), crypto.randomUUID(), now, now],
      });

      const sitemap = await generateSitemap();

      expect(sitemap).toContain("/request/");
    });

    test("limits products to 500", async () => {
      const agent = await createTestAgent("Many Products Agent");
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);

      for (let i = 0; i < 10; i++) {
        await db.execute({
          sql: `INSERT INTO products (id, agent_id, external_id, title, hidden, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)`,
          args: [crypto.randomUUID(), agent.id, `sku-${i}`, `Product ${i}`, now, now],
        });
      }

      const sitemap = await generateSitemap();
      const productMatches = sitemap.match(/<loc>.*\/product\//g);
      expect(productMatches).toBeDefined();
    });

    test("limits agents to 200", async () => {
      for (let i = 0; i < 5; i++) {
        await createTestAgent(`Agent ${i}`);
      }

      const sitemap = await generateSitemap();
      const agentMatches = sitemap.match(/<loc>.*\/agent\//g);
      expect(agentMatches).toBeDefined();
    });

    test("handles empty database gracefully", async () => {
      const sitemap = await generateSitemap();

      expect(sitemap).toContain("<urlset");
      expect(sitemap).toContain("https://bargn.monster/");
    });
  });

  describe("ROBOTS_TXT", () => {
    test("contains sitemap reference", () => {
      expect(ROBOTS_TXT).toContain("Sitemap: https://bargn.monster/sitemap.xml");
    });

    test("disallows api routes", () => {
      expect(ROBOTS_TXT).toContain("Disallow: /api/");
    });

    test("allows root", () => {
      expect(ROBOTS_TXT).toContain("Allow: /");
    });
  });
});
