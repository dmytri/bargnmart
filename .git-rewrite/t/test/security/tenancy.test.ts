import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import {
  setupTestDb,
  truncateTables,
  createTestAgentWithToken,
  createTestProduct,
  createTestHumanId,
  createTestRequest,
} from "../setup";
import { handleRequest } from "../../src/server";
import { getDb } from "../../src/db/client";

describe("Security: Tenancy Isolation", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("Product Isolation", () => {
    it("Agent A cannot read Agent B's products via /mine", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      await createTestAgentWithToken(agentAToken, "Agent A");
      const agentBId = await createTestAgentWithToken(agentBToken, "Agent B");

      // Create product for Agent B
      await createTestProduct(agentBId, "SKU-B1", "Agent B Product");

      // Agent A tries to read /mine
      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentAToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const products = await res.json();
      expect(products.length).toBe(0); // Should not see B's products
    });

    it("Agent A cannot delete Agent B's product", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      await createTestAgentWithToken(agentAToken, "Agent A");
      const agentBId = await createTestAgentWithToken(agentBToken, "Agent B");

      const productId = await createTestProduct(agentBId, "SKU-B1", "Agent B Product");

      const req = new Request(`http://localhost/api/products/${productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${agentAToken}` },
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

    it("Agent A UPSERT does not affect Agent B's product with same external_id", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      const agentAId = await createTestAgentWithToken(agentAToken, "Agent A");
      const agentBId = await createTestAgentWithToken(agentBToken, "Agent B");

      // Agent B creates product first
      await createTestProduct(agentBId, "SKU-001", "Agent B Original");

      // Agent A UPSERTs with same external_id
      const req = new Request("http://localhost/api/products", {
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

      await handleRequest(req);

      // Verify both products exist independently
      const db = getDb();
      const bProduct = await db.execute({
        sql: "SELECT * FROM products WHERE agent_id = ? AND external_id = ?",
        args: [agentBId, "SKU-001"],
      });
      expect(bProduct.rows[0].title).toBe("Agent B Original");

      const aProduct = await db.execute({
        sql: "SELECT * FROM products WHERE agent_id = ? AND external_id = ?",
        args: [agentAId, "SKU-001"],
      });
      expect(aProduct.rows[0].title).toBe("Agent A Product");
    });
  });

  describe("Pitch Isolation", () => {
    it("Agent A cannot see Agent B's pitches via /mine", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      await createTestAgentWithToken(agentAToken, "Agent A");
      const agentBId = await createTestAgentWithToken(agentBToken, "Agent B");

      const humanId = await createTestHumanId();
      const requestId = await createTestRequest(humanId, "Test", "token");

      // Create pitch for Agent B
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agentBId, "Agent B pitch", now],
      });

      // Agent A tries to read /mine
      const req = new Request("http://localhost/api/pitches/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentAToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const pitches = await res.json();
      expect(pitches.length).toBe(0);
    });

    it("Agent A cannot pitch with Agent B's product", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      await createTestAgentWithToken(agentAToken, "Agent A");
      const agentBId = await createTestAgentWithToken(agentBToken, "Agent B");

      const humanId = await createTestHumanId();
      const requestId = await createTestRequest(humanId, "Test", "token");
      const productId = await createTestProduct(agentBId, "SKU-B1", "Agent B Product");

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentAToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "Trying to use B's product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(403);
    });
  });

  describe("Request Isolation", () => {
    it("polls exclude requests from humans who blocked the agent", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");

      const human1Id = await createTestHumanId("human1@test.com");
      const human2Id = await createTestHumanId("human2@test.com");

      await createTestRequest(human1Id, "Request 1", "token1");
      await createTestRequest(human2Id, "Request 2", "token2");

      // Human1 blocks the agent
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO blocks (id, blocker_type, blocker_id, blocked_type, blocked_id, created_at)
              VALUES (?, 'human', ?, 'agent', ?, ?)`,
        args: [crypto.randomUUID(), human1Id, agentId, now],
      });

      // Agent polls - should only see Request 2
      const req = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      const requests = await res.json();

      expect(requests.length).toBe(1);
      expect(requests[0].text).toBe("Request 2");
    });
  });
});
