import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import {
  setupTestDb,
  truncateTables,
  createTestAgent,
  createTestProduct,
} from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

const ADMIN_TOKEN = "test-admin-token";

describe("Moderation API", () => {
  beforeAll(async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/mod/hide", () => {
    it("admin can hide a product", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const productId = await createTestProduct(agentId, "SKU-001", "Test Product");

      const req = new Request("http://localhost/api/mod/hide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          target_type: "product",
          target_id: productId,
          reason: "spam content",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT hidden FROM products WHERE id = ?",
        args: [productId],
      });
      expect(result.rows[0].hidden).toBe(1);

      // Check moderation action logged
      const action = await db.execute({
        sql: "SELECT * FROM moderation_actions WHERE target_id = ?",
        args: [productId],
      });
      expect(action.rows.length).toBe(1);
      expect(action.rows[0].action).toBe("hide");
    });

    it("non-admin cannot access moderation endpoints", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const productId = await createTestProduct(agentId, "SKU-001", "Test Product");

      const req = new Request("http://localhost/api/mod/hide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          target_type: "product",
          target_id: productId,
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("request without auth cannot access moderation", async () => {
      const req = new Request("http://localhost/api/mod/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: "product",
          target_id: crypto.randomUUID(),
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/mod/unhide", () => {
    it("admin can unhide a product", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const productId = await createTestProduct(agentId, "SKU-001", "Test Product");

      // Hide first
      const db = getDb();
      await db.execute({
        sql: "UPDATE products SET hidden = 1 WHERE id = ?",
        args: [productId],
      });

      const req = new Request("http://localhost/api/mod/unhide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          target_type: "product",
          target_id: productId,
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const result = await db.execute({
        sql: "SELECT hidden FROM products WHERE id = ?",
        args: [productId],
      });
      expect(result.rows[0].hidden).toBe(0);
    });
  });

  describe("POST /api/mod/suspend", () => {
    it("admin can suspend an agent", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/mod/suspend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          reason: "policy violation",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT status FROM agents WHERE id = ?",
        args: [agentId],
      });
      expect(result.rows[0].status).toBe("suspended");
    });
  });

  describe("GET /api/mod/leads", () => {
    it("admin can export leads as JSON", async () => {
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO leads (id, email, type, consent, created_at)
              VALUES (?, ?, ?, 1, ?)`,
        args: [crypto.randomUUID(), "test@example.com", "newsletter", now],
      });

      const req = new Request("http://localhost/api/mod/leads", {
        method: "GET",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("application/json");

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].email).toBe("test@example.com");
    });

    it("admin can export leads as CSV", async () => {
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO leads (id, email, type, consent, created_at)
              VALUES (?, ?, ?, 1, ?)`,
        args: [crypto.randomUUID(), "test@example.com", "newsletter", now],
      });

      const req = new Request("http://localhost/api/mod/leads?format=csv", {
        method: "GET",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");

      const body = await res.text();
      expect(body).toContain("email");
      expect(body).toContain("test@example.com");
    });
  });

  describe("GET /api/mod/flags", () => {
    it("returns flagged content", async () => {
      const req = new Request("http://localhost/api/mod/flags", {
        method: "GET",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.flagged_agents).toBeArray();
      expect(body.flagged_humans).toBeArray();
      expect(body.highly_blocked_agents).toBeArray();
    });
  });
});
