import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestHuman, createTestRequest, createTestProduct } from "../setup";
import { handleRequest } from "../../src/server";

describe("Security: Input Validation", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("URL Validation", () => {
    it("rejects javascript: URL scheme", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          product_url: "javascript:alert(1)",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.errors).toBeDefined();
      expect(body.errors.some((e: { field: string }) => e.field === "product_url")).toBe(true);
    });

    it("rejects data: URL scheme", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          product_url: "data:text/html,<script>alert(1)</script>",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("rejects http: URL (requires https)", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          product_url: "http://example.com/product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("accepts valid https: URL", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          product_url: "https://example.com/product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });
  });

  describe("Text Length Validation", () => {
    it("rejects pitch_text over 10000 chars", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test", "token");

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

    it("accepts pitch_text at 10000 chars", async () => {
      const agentToken = "test-agent-token";
      const agentId = await createTestAgent(agentToken, "Test Agent");
      const humanId = await createTestHuman();
      const requestId = await createTestRequest(humanId, "Test", "token");
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
          pitch_text: "x".repeat(10000),
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);
    });

    it("rejects title over 500 chars", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "x".repeat(501),
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("JSON Validation", () => {
    it("rejects invalid tags JSON (not array)", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          tags: '{"not": "array"}',
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("accepts valid tags JSON array", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          tags: '["electronics", "gadgets"]',
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });

    it("rejects invalid metadata JSON (not object)", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          external_id: "SKU-001",
          title: "Test Product",
          metadata: '["not", "object"]',
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("UUID Validation", () => {
    it("rejects non-UUID request_id", async () => {
      const agentToken = "test-agent-token";
      await createTestAgent(agentToken, "Test Agent");

      const req = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          request_id: "not-a-uuid",
          pitch_text: "Test pitch",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("rejects non-UUID in path", async () => {
      const req = new Request("http://localhost/api/requests/not-a-uuid", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });
  });
});
