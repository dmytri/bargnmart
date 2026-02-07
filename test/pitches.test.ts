import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import {
  setupTestDb,
  truncateTables,
  createTestAgent,
  createTestHuman,
  createTestRequest,
  createTestProduct,
  createTestBlock,
} from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Pitches API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/pitches", () => {
    it("creates a pitch for open request", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");
      const productId = await createTestProduct(agentId, "SKU-001", "Test Product");

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "I have the perfect product for you!",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.request_id).toBe(requestId);
    });

    it("creates a pitch with product reference", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");
      const productId = await createTestProduct(agentId, "SKU-001", "Great Product");

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "Check out this product!",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT product_id FROM pitches WHERE request_id = ?",
        args: [requestId],
      });
      expect(result.rows[0].product_id).toBe(productId);
    });

    it("returns 403 when agent is blocked by requester", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");
      const productId = await createTestProduct(agentId, "SKU-001", "Test Product");

      // Block the agent
      await createTestBlock(humanId, agentId);

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "I have something for you!",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(403);
    });

    it("returns 403 when referencing another agent's product", async () => {
      const agentAToken = "agent-a-token";
      const agentBToken = "agent-b-token";
      await createTestAgent(agentAToken, "Agent A");
      const agentBId = await createTestAgent(agentBToken, "Agent B");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");

      // Agent B's product
      const productId = await createTestProduct(agentBId, "SKU-001", "Agent B Product");

      // Agent A tries to pitch with Agent B's product
      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentAToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "This product is great!",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(403);
    });

    it("requires agent authentication", async () => {
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          pitch_text: "I have something!",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("rejects pitch text over 10000 chars", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          pitch_text: "x".repeat(10001),
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/pitches/mine", () => {
    it("lists agent's own pitches", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");

      // Create pitch directly
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agentId, "Test pitch", now],
      });

      const req = new Request("http://localhost/api/pitches/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].pitch_text).toBe("Test pitch");
    });
  });
});
