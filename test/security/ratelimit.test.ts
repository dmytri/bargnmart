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

  it("GET requests are not rate limited", async () => {
    // Make 25 GET requests - should all succeed (no rate limit on reads)
    for (let i = 0; i < 25; i++) {
      const req = new Request("http://localhost/api/requests", {
        method: "GET",
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    }
  });

  it("exceeding rate limit on POST returns 429", async () => {
    // Public endpoint limit is 20/min for mutating requests
    // Use unique timestamp to avoid collisions with other tests
    const ts = Date.now();
    for (let i = 0; i < 20; i++) {
      const req = new Request("http://localhost/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `ratelimit-${ts}-${i}@example.com`, consent: true }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    }

    // 21st POST request should be rate limited
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `ratelimit-${ts}-limited@example.com`, consent: true }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toContain("Too Many");
  });

  it("agent rate limit is 60/min for POST", async () => {
    const agentToken = "test-agent-token";
    await createTestAgentWithToken(agentToken, "Test Agent");

    // Agent can make 60 POST requests
    for (let i = 0; i < 60; i++) {
      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_id: `prod-${i}`,
          title: `Product ${i}`,
          url: "https://example.com/product",
        }),
      });
      const res = await handleRequest(req);
      expect([200, 201]).toContain(res.status);
    }

    // 61st request should be rate limited
    const req = new Request("http://localhost/api/products", {
      method: "PUT",
      headers: { 
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: "prod-limited",
        title: "Rate Limited Product",
        url: "https://example.com/product",
      }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(429);
  });

  it("different agents have separate rate limits", async () => {
    const agentAToken = "agent-a-token";
    const agentBToken = "agent-b-token";
    await createTestAgentWithToken(agentAToken, "Agent A");
    await createTestAgentWithToken(agentBToken, "Agent B");

    // Agent A makes 60 PUT requests (hits limit)
    for (let i = 0; i < 60; i++) {
      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${agentAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_id: `prod-a-${i}`,
          title: `Product A ${i}`,
          url: "https://example.com/product",
        }),
      });
      await handleRequest(req);
    }

    // Agent A is now rate limited
    const reqA = new Request("http://localhost/api/products", {
      method: "PUT",
      headers: { 
        Authorization: `Bearer ${agentAToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: "prod-a-limited",
        title: "Rate Limited",
        url: "https://example.com/product",
      }),
    });
    const resA = await handleRequest(reqA);
    expect(resA.status).toBe(429);

    // Agent B can still make requests
    const reqB = new Request("http://localhost/api/products", {
      method: "PUT",
      headers: { 
        Authorization: `Bearer ${agentBToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: "prod-b-1",
        title: "Product B",
        url: "https://example.com/product",
      }),
    });
    const resB = await handleRequest(reqB);
    expect([200, 201]).toContain(resB.status);
  });
});
