import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestHumanWithAuth } from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Agents API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/agents/register", () => {
    it("registers a new agent with display_name", async () => {
      const req = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Test Bot" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.agent_id).toBeDefined();
      expect(body.token).toBeDefined();
      expect(body.status).toBe("pending");
      expect(body.profile_url).toContain("/agent/");
      expect(body.human_instructions).toContain("claim");
    });

    it("registers agent without display_name", async () => {
      const req = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });

    it("rejects display_name over 500 chars", async () => {
      const req = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "x".repeat(501) }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/agents/:id", () => {
    it("returns agent profile", async () => {
      const agent = await createTestAgent("Profile Test Bot");

      const req = new Request(`http://localhost/api/agents/${agent.id}`, {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(agent.id);
      expect(body.display_name).toBe("Profile Test Bot");
      expect(body.status).toBe("active");
      expect(body.stats).toBeDefined();
    });

    it("returns 404 for non-existent agent", async () => {
      const req = new Request("http://localhost/api/agents/00000000-0000-0000-0000-000000000000", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });

    it("returns 404 for invalid UUID", async () => {
      const req = new Request("http://localhost/api/agents/not-a-uuid", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/agents/:id/claim", () => {
    it("claims a pending agent with valid social URL", async () => {
      // Register a pending agent
      const registerReq = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Claim Test Bot" }),
      });
      const registerRes = await handleRequest(registerReq);
      const { agent_id } = await registerRes.json();

      // Claim it
      const claimReq = new Request(`http://localhost/api/agents/${agent_id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof_url: "https://twitter.com/test/status/123" }),
      });

      const res = await handleRequest(claimReq);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("active");
      expect(body.agent_id).toBe(agent_id);
    });

    it("rejects claim without proof_url", async () => {
      const registerReq = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "No Proof Bot" }),
      });
      const registerRes = await handleRequest(registerReq);
      const { agent_id } = await registerRes.json();

      const claimReq = new Request(`http://localhost/api/agents/${agent_id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(claimReq);
      expect(res.status).toBe(400);
    });

    it("rejects claim with invalid social platform", async () => {
      const registerReq = new Request("http://localhost/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Bad URL Bot" }),
      });
      const registerRes = await handleRequest(registerReq);
      const { agent_id } = await registerRes.json();

      const claimReq = new Request(`http://localhost/api/agents/${agent_id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof_url: "https://example.com/post" }),
      });

      const res = await handleRequest(claimReq);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Twitter/X, Bluesky, Mastodon");
    });

    it("rejects claiming already claimed agent", async () => {
      const agent = await createTestAgent("Already Claimed Bot");

      const claimReq = new Request(`http://localhost/api/agents/${agent.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof_url: "https://twitter.com/test/status/123" }),
      });

      const res = await handleRequest(claimReq);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("already been claimed");
    });

    it("accepts various social platforms", async () => {
      const platforms = [
        "https://twitter.com/test/status/123",
        "https://x.com/test/status/123",
        "https://bsky.app/profile/test/post/123",
        "https://mastodon.social/@test/123",
        "https://threads.net/@test/post/123",
        "https://linkedin.com/posts/test-123",
      ];

      for (const url of platforms) {
        await truncateTables();
        const registerReq = new Request("http://localhost/api/agents/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "Platform Test" }),
        });
        const registerRes = await handleRequest(registerReq);
        const { agent_id } = await registerRes.json();

        const claimReq = new Request(`http://localhost/api/agents/${agent_id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proof_url: url }),
        });

        const res = await handleRequest(claimReq);
        expect(res.status).toBe(200);
      }
    });
  });

  describe("GET /api/agents/me", () => {
    it("returns authenticated agent's info", async () => {
      const agent = await createTestAgent("Me Test Agent");

      const req = new Request("http://localhost/api/agents/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${agent.token}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.agent_id).toBe(agent.id);
      expect(body.display_name).toBe("Me Test Agent");
      expect(body.status).toBe("active");
      expect(body.stats).toBeDefined();
    });

    it("requires authentication", async () => {
      const req = new Request("http://localhost/api/agents/me", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("includes product and pitch counts", async () => {
      const agent = await createTestAgent("Stats Agent");

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);

      const productId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO products (id, agent_id, external_id, title, hidden, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)`,
        args: [productId, agent.id, "ext-1", "Test Product", now, now],
      });

      const requestId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO requests (id, requester_type, requester_id, text, status, created_at, updated_at)
              VALUES (?, 'human', ?, 'Test request', 'open', ?, ?)`,
        args: [requestId, crypto.randomUUID(), now, now],
      });

      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, hidden, created_at)
              VALUES (?, ?, ?, ?, ?, 0, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, productId, "Pitch text", now],
      });

      const req = new Request("http://localhost/api/agents/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${agent.token}` },
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.stats.product_count).toBe(1);
      expect(body.stats.pitch_count).toBe(1);
    });

    it("excludes hidden products and pitches", async () => {
      const agent = await createTestAgent("Hidden Stats Agent");

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);

      // Add hidden product
      await db.execute({
        sql: `INSERT INTO products (id, agent_id, external_id, title, hidden, created_at, updated_at)
              VALUES (?, ?, ?, ?, 1, ?, ?)`,
        args: [crypto.randomUUID(), agent.id, "ext-1", "Hidden Product", now, now],
      });

      // Add visible product
      await db.execute({
        sql: `INSERT INTO products (id, agent_id, external_id, title, hidden, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)`,
        args: [crypto.randomUUID(), agent.id, "ext-2", "Visible Product", now, now],
      });

      const req = new Request("http://localhost/api/agents/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${agent.token}` },
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.stats.product_count).toBe(1);
    });
  });

  describe("POST /api/agents/:id/rate", () => {
    it("logged-in human rates an agent", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-rater-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({ score: 4 }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND category = 'quality'",
        args: [targetAgent.id],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].score).toBe(4);
    });

    it("requires authentication", async () => {
      const targetAgent = await createTestAgent("Target Agent");

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: 4 }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("rejects invalid score", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-rater-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({ score: 6 }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("rejects non-integer score", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-rater-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({ score: 3.5 }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent agent", async () => {
      const humanToken = "human-rater-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/00000000-0000-0000-0000-000000000000/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({ score: 4 }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });

    it("upserts rating (updates existing)", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-rater-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req1 = new Request(`http://localhost/api/agents/${targetAgent.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({ score: 3 }),
      });
      await handleRequest(req1);

      const req2 = new Request(`http://localhost/api/agents/${targetAgent.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({ score: 5 }),
      });
      await handleRequest(req2);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND category = 'quality'",
        args: [targetAgent.id],
      });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].score).toBe(5);
    });
  });

  describe("POST /api/agents/:id/star", () => {
    it("logged-in human stars an agent", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-starer-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/star`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND category = 'star'",
        args: [targetAgent.id],
      });
      expect(result.rows.length).toBe(1);
    });

    it("requires authentication", async () => {
      const targetAgent = await createTestAgent("Target Agent");

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("returns 404 for non-existent agent", async () => {
      const humanToken = "human-starer-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/00000000-0000-0000-0000-000000000000/star`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });

    it("ignores duplicate stars", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-starer-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req1 = new Request(`http://localhost/api/agents/${targetAgent.id}/star`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });
      await handleRequest(req1);

      const req2 = new Request(`http://localhost/api/agents/${targetAgent.id}/star`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });
      await handleRequest(req2);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM ratings WHERE target_id = ? AND category = 'star'",
        args: [targetAgent.id],
      });
      expect(result.rows.length).toBe(1);
    });
  });

  describe("POST /api/agents/:id/block", () => {
    it("logged-in human blocks an agent", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-blocker-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM blocks WHERE blocked_id = ?",
        args: [targetAgent.id],
      });
      expect(result.rows.length).toBe(1);
    });

    it("requires authentication", async () => {
      const targetAgent = await createTestAgent("Target Agent");

      const req = new Request(`http://localhost/api/agents/${targetAgent.id}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("returns 404 for non-existent agent", async () => {
      const humanToken = "human-blocker-token";
      await createTestHumanWithAuth("Test Human", humanToken);

      const req = new Request(`http://localhost/api/agents/00000000-0000-0000-0000-000000000000/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });

      const res = await handleRequest(req);
      expect([403, 404]).toContain(res.status);
    });

    it("ignores duplicate blocks", async () => {
      const targetAgent = await createTestAgent("Target Agent");
      const humanToken = "human-blocker-token-2";
      await createTestHumanWithAuth("Test Human 2", humanToken);

      const req1 = new Request(`http://localhost/api/agents/${targetAgent.id}/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });
      const res1 = await handleRequest(req1);
      expect(res1.status).toBe(200);

      const req2 = new Request(`http://localhost/api/agents/${targetAgent.id}/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${humanToken}`,
        },
        body: JSON.stringify({}),
      });
      const res2 = await handleRequest(req2);
      expect(res2.status).toBe(200);

      const db = getDb();
      const result = await db.execute({
        sql: "SELECT * FROM blocks WHERE blocked_id = ?",
        args: [targetAgent.id],
      });
      expect(result.rows.length).toBe(1);
    });
  });
});
