import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestHumanId, createTestHumanWithAuth, createTestRequest, createTestAgentWithToken, createTestAgent, createTestAgentRequest, createTestProduct } from "./setup";
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
      const humanId = await createTestHumanId();
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
      const humanId = await createTestHumanId();
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
      const humanId = await createTestHumanId();
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
      const humanId = await createTestHumanId();
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
      const humanId = await createTestHumanId();
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
      const humanId = await createTestHumanId();
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
      await createTestAgentWithToken(agentToken, "Test Agent");

      const humanId = await createTestHumanId();
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
      await createTestAgentWithToken(agentToken, "Test Agent");

      const humanId = await createTestHumanId();
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

  describe("Agent Requests", () => {
    it("agent can create a request", async () => {
      const { token } = await createTestAgent("DealBot");
      
      const req = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: "Need bulk pricing on fidget spinners for resale",
          budget_min_cents: 10000,
          budget_max_cents: 50000,
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      // Agents don't get delete tokens
      expect(body.delete_token).toBeUndefined();
    });

    it("agent request appears in list with requester info", async () => {
      const { id: agentId, token } = await createTestAgent("DealBot");
      
      // Create agent request
      const createReq = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: "Need wholesale widgets",
        }),
      });
      await handleRequest(createReq);

      // List requests
      const listReq = new Request("http://localhost/api/requests");
      const res = await handleRequest(listReq);
      const body = await res.json();
      
      expect(body.length).toBe(1);
      expect(body[0].requester_type).toBe("agent");
      expect(body[0].requester_id).toBe(agentId);
      expect(body[0].requester_name).toBe("DealBot");
    });

    it("agent rate limited to 1 request per hour", async () => {
      const { token } = await createTestAgent("SpamBot");
      
      // First request succeeds
      const req1 = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: "First request" }),
      });
      const res1 = await handleRequest(req1);
      expect(res1.status).toBe(201);

      // Second request rate limited
      const req2 = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: "Second request - too soon!" }),
      });
      const res2 = await handleRequest(req2);
      expect(res2.status).toBe(429);
      
      const body = await res2.json();
      expect(body.error).toBe("Rate limited");
      expect(body.message).toContain("1 request per hour");
    });

    it("agent poll excludes own requests", async () => {
      const { id: agentId, token } = await createTestAgent("SelfAwareBot");
      
      // Create a request from this agent
      await createTestAgentRequest(agentId, "My own request");
      
      // Create a human request too
      const humanId = await createTestHumanId();
      await createTestRequest(humanId, "Human request", "token123");

      // Poll - should only see human request, not own
      const pollReq = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await handleRequest(pollReq);
      const body = await res.json();
      
      expect(body.length).toBe(1);
      expect(body[0].text).toBe("Human request");
      expect(body[0].requester_type).toBe("human");
    });

    it("other agents can see and pitch to agent requests", async () => {
      const { id: requesterAgentId } = await createTestAgent("NeedyBot");
      const { id: pitcherAgentId, token: pitcherToken } = await createTestAgent("HelperBot");
      
      // Create request from first agent
      const requestId = await createTestAgentRequest(requesterAgentId, "Need server racks");
      
      // Create product for second agent
      const productId = await createTestProduct(pitcherAgentId, "rack-001", "Premium Server Rack");

      // Poll as second agent - should see the request
      const pollReq = new Request("http://localhost/api/requests/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${pitcherToken}` },
      });
      const pollRes = await handleRequest(pollReq);
      const pollBody = await pollRes.json();
      
      expect(pollBody.length).toBe(1);
      expect(pollBody[0].requester_type).toBe("agent");

      // Pitch to it
      const pitchReq = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pitcherToken}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "I got the racks you need, fellow robot!",
        }),
      });
      const pitchRes = await handleRequest(pitchReq);
      expect(pitchRes.status).toBe(201);
    });

    it("agent cannot pitch to own request", async () => {
      const { id: agentId, token } = await createTestAgent("NarcissistBot");
      
      // Create request
      const requestId = await createTestAgentRequest(agentId, "I need something");
      
      // Create product
      const productId = await createTestProduct(agentId, "prod-001", "My Product");

      // Try to pitch to own request
      const pitchReq = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          product_id: productId,
          pitch_text: "I'll sell to myself!",
        }),
      });
      const res = await handleRequest(pitchReq);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      expect(body.error).toContain("own request");
    });

    it("agent-to-agent pitching rate limited to 1 per 10 minutes", async () => {
      const { id: requesterAgentId } = await createTestAgent("BuyerBot");
      const { id: pitcherAgentId, token: pitcherToken } = await createTestAgent("SellerBot");
      
      // Create two requests from first agent
      const requestId1 = await createTestAgentRequest(requesterAgentId, "Need item A");
      const requestId2 = await createTestAgentRequest(requesterAgentId, "Need item B");
      
      // Create product for pitcher
      const productId = await createTestProduct(pitcherAgentId, "prod-001", "My Product");

      // First pitch succeeds
      const pitch1 = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pitcherToken}`,
        },
        body: JSON.stringify({
          request_id: requestId1,
          product_id: productId,
          pitch_text: "First pitch",
        }),
      });
      const res1 = await handleRequest(pitch1);
      expect(res1.status).toBe(201);

      // Second pitch to different request - rate limited
      const pitch2 = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pitcherToken}`,
        },
        body: JSON.stringify({
          request_id: requestId2,
          product_id: productId,
          pitch_text: "Second pitch - too soon!",
        }),
      });
      const res2 = await handleRequest(pitch2);
      expect(res2.status).toBe(429);
      
      const body = await res2.json();
      expect(body.error).toBe("Rate limited");
      expect(body.message).toContain("10 minutes");
    });

    it("agent-to-human pitching not rate limited the same way", async () => {
      const humanId = await createTestHumanId();
      const { id: agentId, token } = await createTestAgent("PitchBot");
      
      // Create two human requests
      const requestId1 = await createTestRequest(humanId, "Human request 1", "token1");
      const requestId2 = await createTestRequest(humanId, "Human request 2", "token2");
      
      // Create product
      const productId = await createTestProduct(agentId, "prod-001", "Product");

      // First pitch succeeds
      const pitch1 = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          request_id: requestId1,
          product_id: productId,
          pitch_text: "First pitch to human",
        }),
      });
      expect((await handleRequest(pitch1)).status).toBe(201);

      // Second pitch to different human request - NOT rate limited
      const pitch2 = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          request_id: requestId2,
          product_id: productId,
          pitch_text: "Second pitch to human - OK!",
        }),
      });
      expect((await handleRequest(pitch2)).status).toBe(201);
    });

    it("pending agent cannot create request", async () => {
      // Create pending agent (not claimed)
      const db = getDb();
      const agentId = crypto.randomUUID();
      const agentToken = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      
      const tokenHasher = new Bun.CryptoHasher("sha256");
      tokenHasher.update(agentToken);
      const tokenHash = tokenHasher.digest("hex");
      
      await db.execute({
        sql: `INSERT INTO agents (id, token_hash, display_name, status, created_at, updated_at)
              VALUES (?, ?, 'PendingBot', 'pending', ?, ?)`,
        args: [agentId, tokenHash, now, now],
      });

      const req = new Request("http://localhost/api/requests", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${agentToken}`,
        },
        body: JSON.stringify({ text: "I want something" }),
      });
      
      const res = await handleRequest(req);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      // Pending agents get blocked at auth middleware level
      expect(body.error).toContain("not");
    });

    it("GET /api/requests/:id shows requester info for agent request", async () => {
      const { id: agentId } = await createTestAgent("InfoBot");
      const requestId = await createTestAgentRequest(agentId, "Test agent request");
      
      const req = new Request(`http://localhost/api/requests/${requestId}`);
      const res = await handleRequest(req);
      const body = await res.json();
      
      expect(body.requester_type).toBe("agent");
      expect(body.requester_id).toBe(agentId);
      expect(body.requester_name).toBe("InfoBot");
    });
  });
});
