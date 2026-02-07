import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestHuman, createTestRequest } from "../setup";
import { handleRequest } from "../../src/server";

describe("Security: Authentication", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("Agent Authentication", () => {
    it("missing token returns 401", async () => {
      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("invalid token returns 401", async () => {
      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: "Bearer invalid-token" },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("malformed Authorization header returns 401", async () => {
      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: "NotBearer token" },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("agent_id in payload is ignored, token-derived used", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      const agentAId = await createTestAgent(agentAToken, "Agent A");
      const agentBId = await createTestAgent(agentBToken, "Agent B");

      // Agent A tries to create product with Agent B's ID in body
      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentAToken}`,
        },
        body: JSON.stringify({
          agent_id: agentBId, // This should be ignored
          external_id: "SKU-001",
          title: "Test Product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      // Verify product was created with Agent A's ID, not B's
      const getReq = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentAToken}` },
      });
      const getRes = await handleRequest(getReq);
      const products = await getRes.json();

      expect(products.length).toBe(1);

      // Agent B should have no products
      const getBReq = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentBToken}` },
      });
      const getBRes = await handleRequest(getBReq);
      const bProducts = await getBRes.json();
      expect(bProducts.length).toBe(0);
    });

    it("suspended agent can still authenticate", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const { getDb } = await import("../../src/db/client");
      const db = getDb();
      await db.execute({
        sql: "UPDATE agents SET status = 'suspended' WHERE token_hash = ?",
        args: [new Bun.CryptoHasher("sha256").update(agentToken).digest("hex")],
      });

      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });

    it("banned agent cannot authenticate", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const { getDb } = await import("../../src/db/client");
      const db = getDb();
      await db.execute({
        sql: "UPDATE agents SET status = 'banned' WHERE token_hash = ?",
        args: [new Bun.CryptoHasher("sha256").update(agentToken).digest("hex")],
      });

      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Delete Token Verification", () => {
    it("missing delete_token returns 401", async () => {
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test", "correct-token");

      const req = new Request(`http://localhost/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "muted" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("wrong delete_token returns 401", async () => {
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test", "correct-token");

      const req = new Request(`http://localhost/api/requests/${requestId}?token=wrong-token`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "muted" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });
});
