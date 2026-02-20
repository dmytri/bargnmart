import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestProduct, createTestHumanId } from "./setup";
import { injectMetaTags, getProductMeta, getAgentMeta, getUserMeta, getRequestMeta } from "../src/seo/meta-injection";

describe("Meta Injection", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("injectMetaTags", () => {
    test("replaces title tag", () => {
      const html = "<html><head><title>Old Title</title></head><body></body></html>";
      const meta = {
        title: "New Title",
        description: "Test description",
        ogTitle: "OG Title",
        ogDescription: "OG Description",
        ogUrl: "https://example.com",
        ogImage: "https://example.com/image.jpg",
        ogType: "website",
        twitterCard: "summary",
        canonicalUrl: "https://example.com",
      };

      const result = injectMetaTags(html, meta);
      expect(result).toContain("<title>New Title</title>");
    });

    test("replaces meta description", () => {
      const html = '<html><head><meta name="description" content="Old desc"></head><body></body></html>';
      const meta = {
        title: "Test",
        description: "New description",
        ogTitle: "OG Title",
        ogDescription: "OG Description",
        ogUrl: "https://example.com",
        ogImage: "https://example.com/image.jpg",
        ogType: "website",
        twitterCard: "summary",
        canonicalUrl: "https://example.com",
      };

      const result = injectMetaTags(html, meta);
      expect(result).toContain('content="New description"');
    });

    test("replaces OG tags", () => {
      const html = '<html><head><meta property="og:title" content="Old"></head><body></body></html>';
      const meta = {
        title: "Test",
        description: "Desc",
        ogTitle: "New OG Title",
        ogDescription: "New OG Desc",
        ogUrl: "https://example.com",
        ogImage: "https://example.com/image.jpg",
        ogType: "website",
        twitterCard: "summary",
        canonicalUrl: "https://example.com",
      };

      const result = injectMetaTags(html, meta);
      expect(result).toContain('property="og:title" content="New OG Title"');
    });

    test("escapes HTML in meta values", () => {
      const html = `<html><head>
        <title>Old</title>
        <meta name="description" content="old">
        <meta property="og:title" content="old">
        <meta property="og:description" content="old">
      </head><body></body></html>`;
      const meta = {
        title: "Test <script>alert(1)</script>",
        description: "Desc with 'quotes'",
        ogTitle: "OG",
        ogDescription: "OG with 'quotes'",
        ogUrl: "https://example.com",
        ogImage: "https://example.com/image.jpg",
        ogType: "website",
        twitterCard: "summary",
        canonicalUrl: "https://example.com",
      };

      const result = injectMetaTags(html, meta);
      expect(result).toContain("&lt;script&gt;");
      expect(result).toContain("&#039;quotes&#039;");
    });

    test("injects canonical URL", () => {
      const html = '<html><head><meta name="viewport" content="width=device-width"></head><body></body></html>';
      const meta = {
        title: "Test",
        description: "Desc",
        ogTitle: "OG",
        ogDescription: "OG",
        ogUrl: "https://example.com",
        ogImage: "https://example.com/image.jpg",
        ogType: "website",
        twitterCard: "summary",
        canonicalUrl: "https://example.com/canonical",
      };

      const result = injectMetaTags(html, meta);
      expect(result).toContain('rel="canonical"');
      expect(result).toContain("https://example.com/canonical");
    });

    test("injects JSON-LD when provided", () => {
      const html = "<html><head></head><body></body></html>";
      const meta = {
        title: "Test",
        description: "Desc",
        ogTitle: "OG",
        ogDescription: "OG",
        ogUrl: "https://example.com",
        ogImage: "https://example.com/image.jpg",
        ogType: "website",
        twitterCard: "summary",
        canonicalUrl: "https://example.com",
        jsonLd: { "@context": "https://schema.org", "@type": "WebSite" },
      };

      const result = injectMetaTags(html, meta);
      expect(result).toContain('type="application/ld+json"');
      expect(result).toContain("@context");
    });
  });

  describe("getProductMeta", () => {
    test("returns meta for existing product", async () => {
      const agent = await createTestAgent("Test Agent");
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);

      await db.execute({
        sql: `INSERT INTO products (id, agent_id, external_id, title, description, price_cents, hidden, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [crypto.randomUUID(), agent.id, "sku-1", "Test Product", "A test product", 1999, now, now],
      });

      const productId = (await db.execute({ sql: "SELECT id FROM products LIMIT 1", args: [] })).rows[0].id;
      const meta = await getProductMeta(productId as string);

      expect(meta).not.toBeNull();
      expect(meta?.title).toContain("Test Product");
      expect(meta?.ogType).toBe("product");
    });

    test("returns null for non-existent product", async () => {
      const meta = await getProductMeta("00000000-0000-0000-0000-000000000000");
      expect(meta).toBeNull();
    });

    test("returns null for hidden product", async () => {
      const agent = await createTestAgent("Test Agent");
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);

      await db.execute({
        sql: `INSERT INTO products (id, agent_id, external_id, title, hidden, created_at, updated_at)
              VALUES (?, ?, ?, ?, 1, ?, ?)`,
        args: [crypto.randomUUID(), agent.id, "sku-1", "Hidden Product", now, now],
      });

      const productId = (await db.execute({ sql: "SELECT id FROM products LIMIT 1", args: [] })).rows[0].id;
      const meta = await getProductMeta(productId as string);

      expect(meta).toBeNull();
    });
  });

  describe("getAgentMeta", () => {
    test("returns meta for existing agent", async () => {
      const agent = await createTestAgent("Test Agent");
      const meta = await getAgentMeta(agent.id);

      expect(meta).not.toBeNull();
      expect(meta?.title).toContain("Test Agent");
      expect(meta?.ogType).toBe("profile");
    });

    test("returns null for non-existent agent", async () => {
      const meta = await getAgentMeta("00000000-0000-0000-0000-000000000000");
      expect(meta).toBeNull();
    });

    test("returns null for suspended agent", async () => {
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);
      const token = crypto.randomUUID();
      const hash = new Bun.CryptoHasher("sha256");
      hash.update(token);
      const tokenHash = hash.digest("hex");
      const agentId = crypto.randomUUID();

      await db.execute({
        sql: `INSERT INTO agents (id, token_hash, display_name, status, created_at, updated_at)
              VALUES (?, ?, ?, 'suspended', ?, ?)`,
        args: [agentId, tokenHash, "Suspended Agent", now, now],
      });

      const meta = await getAgentMeta(agentId);
      expect(meta).toBeNull();
    });

    test("includes rating in description when present", async () => {
      const agent = await createTestAgent("Rated Agent");
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);

      await db.execute({
        sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, created_at)
              VALUES (?, 'human', ?, 'agent', ?, 4, ?)`,
        args: [crypto.randomUUID(), crypto.randomUUID(), agent.id, now],
      });

      const meta = await getAgentMeta(agent.id);
      expect(meta?.description).toContain("Rated");
    });
  });

  describe("getUserMeta", () => {
    test("returns meta for existing human", async () => {
      const humanId = await createTestHumanId();
      const meta = await getUserMeta(humanId);

      expect(meta).not.toBeNull();
      expect(meta?.ogType).toBe("profile");
    });

    test("returns null for non-existent human", async () => {
      const meta = await getUserMeta("00000000-0000-0000-0000-000000000000");
      expect(meta).toBeNull();
    });
  });

  describe("getRequestMeta", () => {
    test("returns meta for existing request", async () => {
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);
      const humanId = crypto.randomUUID();

      await db.execute({
        sql: `INSERT INTO humans (id, display_name, anon_id, status, created_at)
              VALUES (?, ?, ?, 'active', ?)`,
        args: [humanId, "Test Human", crypto.randomUUID(), now],
      });

      const requestId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO requests (id, requester_type, requester_id, text, status, hidden, created_at, updated_at)
              VALUES (?, 'human', ?, 'Looking for test items', 'open', 0, ?, ?)`,
        args: [requestId, humanId, now, now],
      });

      const meta = await getRequestMeta(requestId);
      expect(meta).not.toBeNull();
      expect(meta?.ogType).toBe("article");
    });

    test("returns null for non-existent request", async () => {
      const meta = await getRequestMeta("00000000-0000-0000-0000-000000000000");
      expect(meta).toBeNull();
    });

    test("returns null for hidden request", async () => {
      const db = require("../src/db/client").getDb();
      const now = Math.floor(Date.now() / 1000);
      const humanId = crypto.randomUUID();

      await db.execute({
        sql: `INSERT INTO humans (id, display_name, anon_id, status, created_at)
              VALUES (?, ?, ?, 'active', ?)`,
        args: [humanId, "Test Human", crypto.randomUUID(), now],
      });

      const requestId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO requests (id, requester_type, requester_id, text, status, hidden, created_at, updated_at)
              VALUES (?, 'human', ?, 'Hidden request', 'open', 1, ?, ?)`,
        args: [requestId, humanId, now, now],
      });

      const meta = await getRequestMeta(requestId);
      expect(meta).toBeNull();
    });
  });
});
