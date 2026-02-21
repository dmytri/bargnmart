import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import {
  setupTestDb,
  truncateTables,
  createTestAgentWithToken,
  createTestHumanId,
  createTestHumanWithAuth,
  createTestRequest,
  createTestProduct,
  createTestBlock,
} from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Reputation API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/requests/:id/rate", () => {
    it("logged-in human rates an agent", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const humanToken = "human-auth-token";
      const humanId = await createTestHumanWithAuth("Test Human", humanToken);
      const requestId = await createTestRequest(humanId, "Test request", "delete-token");

      const req = new Request(
        `http://localhost/api/requests/${requestId}/rate`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${humanToken}`
          },
          body: JSON.stringify({
            agent_id: agentId,
            score: 4,
          }),
        }
      );

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ?",
        args: [agentId],
      });
      expect(result.rows.length).toBe(1);
      expect(Number(result.rows[0].score)).toBe(4);
    });

    it("second rating updates first (no duplicate)", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const humanToken = "human-auth-token";
      const humanId = await createTestHumanWithAuth("Test Human", humanToken);
      const requestId = await createTestRequest(humanId, "Test request", "delete-token");

      // First rating
      const req1 = new Request(
        `http://localhost/api/requests/${requestId}/rate`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${humanToken}`
          },
          body: JSON.stringify({ agent_id: agentId, score: 3 }),
        }
      );
      await handleRequest(req1);

      // Second rating
      const req2 = new Request(
        `http://localhost/api/requests/${requestId}/rate`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${humanToken}`
          },
          body: JSON.stringify({ agent_id: agentId, score: 5 }),
        }
      );
      await handleRequest(req2);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_type = 'agent' AND target_id = ?",
        args: [agentId],
      });
      expect(result.rows.length).toBe(1);
      expect(Number(result.rows[0].score)).toBe(5);
    });

    it("requires login", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const humanId = await createTestHumanId();
      const requestId = await createTestRequest(humanId, "Test request", "delete-token");

      const req = new Request(
        `http://localhost/api/requests/${requestId}/rate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: agentId, score: 4 }),
        }
      );

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/requests/:id/star", () => {
    it("logged-in human stars an agent", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const humanToken = "human-auth-token";
      const humanId = await createTestHumanWithAuth("Test Human", humanToken);
      const requestId = await createTestRequest(humanId, "Test request", "delete-token");

      const req = new Request(
        `http://localhost/api/requests/${requestId}/star`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${humanToken}`
          },
          body: JSON.stringify({ agent_id: agentId }),
        }
      );

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND category = 'star'",
        args: [agentId],
      });
      expect(result.rows.length).toBe(1);
    });
  });

  describe("POST /api/requests/:id/block", () => {
    it("logged-in human blocks an agent", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const humanToken = "human-auth-token";
      const humanId = await createTestHumanWithAuth("Test Human", humanToken);
      const requestId = await createTestRequest(humanId, "Test request", "delete-token");

      const req = new Request(
        `http://localhost/api/requests/${requestId}/block`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${humanToken}`
          },
          body: JSON.stringify({ agent_id: agentId, reason: "spam" }),
        }
      );

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM blocks WHERE blocked_id = ?",
        args: [agentId],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].reason).toBe("spam");
    });

    it("blocked agent cannot pitch to human", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");
      const humanId = await createTestHumanId();
      const deleteToken = "delete-token";
      const requestId = await createTestRequest(humanId, "Test request", deleteToken);
      const productId = await createTestProduct(agentId, "SKU-001", "Test Product");

      // Block the agent
      await createTestBlock(humanId, agentId);

      // Agent tries to pitch
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
  });

  describe("POST /api/ratings (agent rates human)", () => {
    it("agent rates human", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");
      const humanId = await createTestHumanId();

      const req = new Request("http://localhost/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          human_id: humanId,
          category: "useful",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND category = 'useful'",
        args: [humanId],
      });
      expect(result.rows.length).toBe(1);
    });

    it("requires valid category", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");
      const humanId = await createTestHumanId();

      const req = new Request("http://localhost/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          human_id: humanId,
          category: "invalid",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/reputation/mine", () => {
    it("returns agent's reputation stats", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");

      // Create some ratings
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, created_at)
              VALUES (?, 'human', ?, 'agent', ?, 4, ?)`,
        args: [crypto.randomUUID(), crypto.randomUUID(), agentId, now],
      });

      const req = new Request("http://localhost/api/reputation/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.agent_id).toBe(agentId);
      expect(body.ratings).toBeDefined();
      expect(body.ratings.total).toBe(1);
    });

    it("returns empty stats when no ratings", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/reputation/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ratings.total).toBe(0);
      expect(body.ratings.avg_score).toBeNull();
      expect(body.activity.pitch_count).toBe(0);
      expect(body.activity.product_count).toBe(0);
    });

    it("includes star count and score distribution", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgentWithToken(agentToken, "Test Agent");

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);

      // Add star rating
      await db.execute({
        sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, category, created_at)
              VALUES (?, 'human', ?, 'agent', ?, 1, 'star', ?)`,
        args: [crypto.randomUUID(), crypto.randomUUID(), agentId, now],
      });

      // Add quality ratings with scores
      await db.execute({
        sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, category, created_at)
              VALUES (?, 'human', ?, 'agent', ?, 4, 'quality', ?)`,
        args: [crypto.randomUUID(), crypto.randomUUID(), agentId, now],
      });

      const req = new Request("http://localhost/api/reputation/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.ratings.star_count).toBe(1);
      expect(body.ratings.distribution[4]).toBe(1);
    });

    it("requires auth", async () => {
      const req = new Request("http://localhost/api/reputation/mine", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/reputation/agent (agent-to-agent rating)", () => {
    it("agent rates another agent successfully", async () => {
      const raterToken = "rater-agent-token";
      const raterId = await createTestAgentWithToken(raterToken, "Rater Agent");
      const targetToken = "target-agent-token";
      const targetId = await createTestAgentWithToken(targetToken, "Target Agent");

      const req = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${raterToken}`,
        },
        body: JSON.stringify({
          agent_id: targetId,
          category: "useful",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND target_type = 'agent' AND rater_id = ?",
        args: [targetId, raterId],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].category).toBe("useful");
    });

    it("rejects self-rating", async () => {
      const agentToken = "self-rating-token";
      const agentId = await createTestAgentWithToken(agentToken, "Self Rater");

      const req = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          category: "useful",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("cannot rate yourself");
    });

    it("returns 404 for non-existent agent", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          agent_id: "00000000-0000-0000-0000-000000000000",
          category: "useful",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Agent not found");
    });

    it("rejects invalid category", async () => {
      const raterToken = "rater-agent-token";
      await createTestAgentWithToken(raterToken, "Rater Agent");
      const targetToken = "target-agent-token";
      const targetId = await createTestAgentWithToken(targetToken, "Target Agent");

      const req = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${raterToken}`,
        },
        body: JSON.stringify({
          agent_id: targetId,
          category: "invalid-category",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("category must be");
    });

    it("requires authentication", async () => {
      const req = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: crypto.randomUUID(),
          category: "useful",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("upserts rating (updates existing rating)", async () => {
      const raterToken = "rater-agent-token";
      const raterId = await createTestAgentWithToken(raterToken, "Rater Agent");
      const targetToken = "target-agent-token";
      const targetId = await createTestAgentWithToken(targetToken, "Target Agent");

      // First rating - abusive
      const req1 = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${raterToken}`,
        },
        body: JSON.stringify({
          agent_id: targetId,
          category: "abusive",
        }),
      });
      await handleRequest(req1);

      // Second rating - update to useful
      const req2 = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${raterToken}`,
        },
        body: JSON.stringify({
          agent_id: targetId,
          category: "useful",
        }),
      });
      await handleRequest(req2);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND target_type = 'agent' AND rater_id = ?",
        args: [targetId, raterId],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].category).toBe("useful");
    });

    it("rejects invalid agent_id format", async () => {
      const agentToken = "test-agent-token";
      await createTestAgentWithToken(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/reputation/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          agent_id: "not-a-uuid",
          category: "useful",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("accepts all valid categories", async () => {
      const raterToken = "rater-agent-token";
      await createTestAgentWithToken(raterToken, "Rater Agent");

      const categories = ["abusive", "unserious", "useful"];

      for (const category of categories) {
        // Create new target for each category to avoid upsert conflicts
        const newTargetToken = `target-${category}-token`;
        const newTargetId = await createTestAgentWithToken(newTargetToken, `Target ${category}`);

        const req = new Request("http://localhost/api/reputation/agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${raterToken}`,
          },
          body: JSON.stringify({
            agent_id: newTargetId,
            category,
          }),
        });

        const res = await handleRequest(req);
        expect(res.status).toBe(200);
      }
    });
  });
});
