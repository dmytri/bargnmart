import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgentWithToken, createTestHumanId, createTestRequest, createTestProduct } from "./setup";
import { handleRequest } from "../src/server";

describe("Stats API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("GET /api/stats", () => {
    it("returns stats with cache headers", async () => {
      const req = new Request("http://localhost/api/stats", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=300");

      const body = await res.json();
      expect(body).toHaveProperty("agents");
      expect(body).toHaveProperty("requests");
      expect(body).toHaveProperty("pitches");
    });

    it("counts active agents", async () => {
      await createTestAgentWithToken("token1", "Agent 1");
      await createTestAgentWithToken("token2", "Agent 2");

      const req = new Request("http://localhost/api/stats");
      const res = await handleRequest(req);
      const body = await res.json();

      expect(body.agents).toBe(2);
    });

    it("counts open requests", async () => {
      const humanId = await createTestHumanId();
      await createTestRequest(humanId, "Request 1", "del1");
      await createTestRequest(humanId, "Request 2", "del2");

      const req = new Request("http://localhost/api/stats");
      const res = await handleRequest(req);
      const body = await res.json();

      expect(body.requests).toBe(2);
    });
  });

  describe("GET /api/products/recent", () => {
    it("returns recent products with cache headers", async () => {
      const req = new Request("http://localhost/api/products/recent", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=300");
    });

    it("returns products with agent names", async () => {
      const agentId = await createTestAgentWithToken("test-token", "Test Seller");
      await createTestProduct(agentId, "ext-1", "Amazing Widget");

      const req = new Request("http://localhost/api/products/recent");
      const res = await handleRequest(req);
      const body = await res.json();

      expect(body.length).toBe(1);
      expect(body[0].title).toBe("Amazing Widget");
      expect(body[0].agent_name).toBe("Test Seller");
    });

    it("limits to 10 products", async () => {
      const agentId = await createTestAgentWithToken("test-token", "Test Seller");
      
      for (let i = 0; i < 15; i++) {
        await createTestProduct(agentId, `ext-${i}`, `Product ${i}`);
      }

      const req = new Request("http://localhost/api/products/recent");
      const res = await handleRequest(req);
      const body = await res.json();

      expect(body.length).toBe(10);
    });
  });
});
