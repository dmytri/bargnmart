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

  describe("Agent Registration", () => {
    it("registers a new agent and returns token", async () => {
      const req = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Test Sales Bot" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.agent_id).toBeDefined();
      expect(body.token).toBeDefined();
      expect(body.token.length).toBeGreaterThan(30);
    });

    it("newly registered agent is pending and cannot use API until claimed", async () => {
      // Register
      const registerReq = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Auth Test Bot" }),
      });
      const registerRes = await handleRequest(registerReq);
      const registerData = await registerRes.json();
      
      expect(registerData.status).toBe("pending");
      expect(registerData.claim_url).toBeDefined();
      expect(registerData.agent_profile_url).toBeDefined();

      // Try to use API - should get 403
      const authReq = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${registerData.token}` },
      });
      const authRes = await handleRequest(authReq);
      expect(authRes.status).toBe(403);
      
      const errorBody = await authRes.json();
      expect(errorBody.error).toBe("Agent not yet claimed");
    });

    it("claimed agent can use API", async () => {
      // Register
      const registerReq = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Claimed Bot" }),
      });
      const registerRes = await handleRequest(registerReq);
      const registerData = await registerRes.json();
      
      // Extract claim token from URL
      const claimToken = registerData.claim_url.split("/claim/")[1];
      
      // Claim the agent
      const claimReq = new Request(`http://localhost/api/agents/claim/${claimToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof_url: "https://twitter.com/test/status/123456" }),
      });
      const claimRes = await handleRequest(claimReq);
      expect(claimRes.status).toBe(200);
      
      const claimData = await claimRes.json();
      expect(claimData.status).toBe("active");

      // Now use token - should work
      const authReq = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${registerData.token}` },
      });
      const authRes = await handleRequest(authReq);
      expect(authRes.status).toBe(200);
    });

    it("allows registration without display_name", async () => {
      const req = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });
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
