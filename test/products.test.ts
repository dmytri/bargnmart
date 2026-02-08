import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgentWithToken, createTestProduct } from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Products API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("PUT /api/products", () => {
    it("creates a product for authenticated agent", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          description: "A great product",
          price_cents: 1999,
          product_url: "https://example.com/product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.external_id).toBe("SKU-001");
    });

    it("updates existing product on same external_id", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");

      // Create first
      const req1 = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Original Title",
          price_cents: 1999,
        }),
      });
      await handleRequest(req1);

      // Update
      const req2 = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Updated Title",
          price_cents: 2999,
        }),
      });
      const res = await handleRequest(req2);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM products WHERE agent_id = ? AND external_id = ?",
        args: [agentId, "SKU-001"],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].title).toBe("Updated Title");
      expect(result.rows[0].price_cents).toBe(2999);
    });

    it("agent A cannot overwrite agent B's product", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      const agentAId = await createTestAgentWithToken(agentAToken, "Agent A");
      await createTestAgentWithToken(agentBToken, "Agent B");

      // Agent A creates product
      const req1 = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentAToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Agent A Product",
        }),
      });
      await handleRequest(req1);

      // Agent B tries same external_id
      const req2 = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentBToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Agent B Product",
        }),
      });
      await handleRequest(req2);

      // Verify Agent A's product unchanged
      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM products WHERE agent_id = ? AND external_id = ?",
        args: [agentAId, "SKU-001"],
      });
      expect(result.rows[0].title).toBe("Agent A Product");

      // Both agents have their own products
      const allProducts = await db.execute({
        sql: "SELECT * FROM products WHERE external_id = ?",
        args: ["SKU-001"],
      });
      expect(allProducts.rows.length).toBe(2);
    });

    it("requires agent authentication", async () => {
      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("rejects invalid product_url scheme", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          product_url: "javascript:alert(1)",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/products", () => {
    it("lists all products", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      await createTestProduct(agentId, "SKU-001", "Product 1");
      await createTestProduct(agentId, "SKU-002", "Product 2");

      const req = new Request("http://localhost/api/products", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(2);
    });
  });

  describe("GET /api/products/mine", () => {
    it("lists only agent's own products", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      const agentAId = await createTestAgentWithToken(agentAToken, "Agent A");
      const agentBId = await createTestAgentWithToken(agentBToken, "Agent B");

      await createTestProduct(agentAId, "SKU-A1", "Agent A Product");
      await createTestProduct(agentBId, "SKU-B1", "Agent B Product");

      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentAToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].title).toBe("Agent A Product");
    });
  });

  describe("DELETE /api/products/:id", () => {
    it("deletes agent's own product", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const productId = await createTestProduct(agentId, "SKU-001", "Product");

      const req = new Request(`http://localhost/api/products/${productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM products WHERE id = ?",
        args: [productId],
      });
      expect(result.rows.length).toBe(0);
    });

    it("cannot delete another agent's product", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      const agentAId = await createTestAgentWithToken(agentAToken, "Agent A");
      await createTestAgentWithToken(agentBToken, "Agent B");

      const productId = await createTestProduct(agentAId, "SKU-001", "Agent A Product");

      const req = new Request(`http://localhost/api/products/${productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${agentBToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(403);

      // Verify product still exists
      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM products WHERE id = ?",
        args: [productId],
      });
      expect(result.rows.length).toBe(1);
    });
  });
});
