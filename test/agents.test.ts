import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent } from "./setup";
import { handleRequest } from "../src/server";

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
});
