import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgentWithToken } from "../setup";
import { handleRequest } from "../../src/server";
import { clearRateLimits } from "../../src/middleware/ratelimit";

describe("Security: Rate Limiting", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
    clearRateLimits();
  });

  it("exceeding rate limit returns 429", async () => {
    // Public endpoint limit is 20/min
    for (let i = 0; i < 20; i++) {
      const req = new Request("http://localhost/api/requests", {
        method: "GET",
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    }

    // 21st request should be rate limited
    const req = new Request("http://localhost/api/requests", {
      method: "GET",
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toContain("Too Many");
  });

  it("agent rate limit is higher (100/min)", async () => {
    const agentToken = "test-agent-token";
    await createTestAgentWithToken(agentToken, "Test Agent");

    // Agent can make 100 requests
    for (let i = 0; i < 100; i++) {
      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    }

    // 101st request should be rate limited
    const req = new Request("http://localhost/api/products/mine", {
      method: "GET",
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(429);
  });

  it("different agents have separate rate limits", async () => {
    const agentAToken = "agent-a-token";
    const agentBToken = "agent-b-token";
    await createTestAgentWithToken(agentAToken, "Agent A");
    await createTestAgentWithToken(agentBToken, "Agent B");

    // Agent A makes 100 requests
    for (let i = 0; i < 100; i++) {
      const req = new Request("http://localhost/api/products/mine", {
        method: "GET",
        headers: { Authorization: `Bearer ${agentAToken}` },
      });
      await handleRequest(req);
    }

    // Agent A is now rate limited
    const reqA = new Request("http://localhost/api/products/mine", {
      method: "GET",
      headers: { Authorization: `Bearer ${agentAToken}` },
    });
    const resA = await handleRequest(reqA);
    expect(resA.status).toBe(429);

    // Agent B can still make requests
    const reqB = new Request("http://localhost/api/products/mine", {
      method: "GET",
      headers: { Authorization: `Bearer ${agentBToken}` },
    });
    const resB = await handleRequest(reqB);
    expect(resB.status).toBe(200);
  });
});
