import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestHuman, createTestHumanWithAuth, createTestRequest, createTestAgent } from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Requests API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/requests", () => {
    it("creates a request and returns delete_token", async () => {
      await createTestHumanWithAuth("TestUser", "human-token");
      
      const req = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer human-token",
        },
        body: JSON.stringify({
          text: "I need a gift for my dad under $50",
          budget_max_cents: 5000,
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.delete_token).toBeDefined();
      expect(body.delete_token.length).toBe(64);
    });

    it("rejects request without text", async () => {
      await createTestHumanWithAuth("TestUser", "human-token");
      
      const req = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer human-token",
        },
        body: JSON.stringify({
          budget_max_cents: 5000,
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const req = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test request" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/requests", () => {
    it("lists open requests", async () => {
      const humanId = await createTestHuman();
      await createTestRequest(humanId, "Test request 1", "token1");
      await createTestRequest(humanId, "Test request 2", "token2");

      const req = new Request("http://localhost/api/requests", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(2);
    });
  });

  describe("GET /api/requests/:id", () => {
    it("returns request with pitches", async () => {
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token1");

      const req = new Request(`http://localhost/api/requests/${requestId}`, {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(requestId);
      expect(body.text).toBe("Test request");
      expect(body.pitches).toBeArray();
    });

    it("returns 404 for non-existent request", async () => {
      const req = new Request("http://localhost/api/requests/00000000-0000-0000-0000-000000000000", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/requests/:id", () => {
    it("updates request status with valid token", async () => {
      const humanId = await createTestHuman();
      const deleteToken = "valid-delete-token";
      const requestId = await createTestRequest(humanId, "Test request", deleteToken);

      const req = new Request(`http://localhost/api/requests/${requestId}?token=${deleteToken}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "muted" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT status FROM requests WHERE id = ?",
        args: [requestId],
      });
      expect(result.rows[0].status).toBe("muted");
    });

    it("rejects update with invalid token", async () => {
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "correct-token");

      const req = new Request(`http://localhost/api/requests/${requestId}?token=wrong-token`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "muted" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("rejects update without token", async () => {
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test request", "token");

      const req = new Request(`http://localhost/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "muted" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /api/requests/:id", () => {
    it("soft-deletes request with valid token", async () => {
      const humanId = await createTestHuman();
      const deleteToken = "valid-delete-token";
      const requestId = await createTestRequest(humanId, "Test request", deleteToken);

      const req = new Request(`http://localhost/api/requests/${requestId}?token=${deleteToken}`, {
        method: "DELETE",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT status FROM requests WHERE id = ?",
        args: [requestId],
      });
      expect(result.rows[0].status).toBe("deleted");
    });
  });

  describe("GET /api/requests/poll", () => {
    it("requires agent authentication", async () => {
      const req = new Request("http://localhost/api/requests/poll", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("returns requests for authenticated agent", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const humanId = await createTestHuman();
      await createTestRequest(humanId, "Test request", "token1");

      const req = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
    });

    it("only returns new requests since last poll", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const humanId = await createTestHuman();
      await createTestRequest(humanId, "First request", "token1");

      // First poll - should see the request
      const req1 = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const res1 = await handleRequest(req1);
      const body1 = await res1.json();
      expect(body1.length).toBe(1);

      // Second poll - should be empty (already seen)
      const req2 = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const res2 = await handleRequest(req2);
      const body2 = await res2.json();
      expect(body2.length).toBe(0);

      // Wait a moment for timestamp to advance, then create a new request
      await new Promise(resolve => setTimeout(resolve, 1100));
      await createTestRequest(humanId, "Second request", "token2");

      // Third poll - should see only the new request
      const req3 = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const res3 = await handleRequest(req3);
      const body3 = await res3.json();
      expect(body3.length).toBe(1);
      expect(body3[0].text).toBe("Second request");
    });
  });
});
