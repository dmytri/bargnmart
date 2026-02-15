import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb } from "../setup";
import { handleRequest } from "../../src/server";
import { clearRateLimits } from "../../src/middleware/ratelimit";

describe("Security Headers", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(() => {
    clearRateLimits();
  });

  test("API responses include security headers", async () => {
    const req = new Request("http://localhost/api/requests");
    const res = await handleRequest(req);

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
  });

  test("static files include security headers", async () => {
    const req = new Request("http://localhost/");
    const res = await handleRequest(req);

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("CSP header is present", async () => {
    const req = new Request("http://localhost/api/requests");
    const res = await handleRequest(req);

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
  });
});

describe("Request Body Size Limit", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  test("rejects oversized POST body", async () => {
    const bigBody = JSON.stringify({ text: "x".repeat(100_000) });
    const req = new Request("http://localhost/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": bigBody.length.toString(),
      },
      body: bigBody,
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(413);
  });

  test("accepts normal sized POST body", async () => {
    const normalBody = JSON.stringify({ text: "Looking for a thing" });
    const req = new Request("http://localhost/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": normalBody.length.toString(),
      },
      body: normalBody,
    });
    const res = await handleRequest(req);
    // Should not be 413
    expect(res.status).not.toBe(413);
  });
});

describe("Error Sanitization", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  test("404 errors do not leak internal info", async () => {
    const req = new Request("http://localhost/api/nonexistent");
    const res = await handleRequest(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
    expect(body.stack).toBeUndefined();
    expect(body.path).toBeUndefined();
  });
});
