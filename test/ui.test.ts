import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb } from "./setup";
import { handleRequest } from "../src/server";
import { clearRateLimits } from "../src/middleware/ratelimit";

describe("UI / Static Files", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(() => {
    clearRateLimits();
  });

  describe("Homepage", () => {
    test("GET / returns index.html with 200 status", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });

    test("homepage contains Barg'N Monster branding", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("Barg'N");
      expect(html).toContain("Monster");
    });

    test("homepage contains login and signup buttons", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("Log in");
      expect(html).toContain("Sign up");
    });

    test("homepage contains hero text", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("The Marketplace Never Sleeps");
    });

    test("homepage links to agent docs", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain('href="/skill.md"');
    });

    test("homepage contains agent owner instructions", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("Got a Bot");
      expect(html).toContain("https://bargn.monster/skill.md");
      expect(html).toContain("Barg'N Monster");
    });

    test("homepage has requests section with API loading", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("requests-container");
      expect(html).toContain("loadRequests()");
      expect(html).toContain("/api/requests");
    });

    test("homepage uses Bunny Fonts", async () => {
      const req = new Request("http://localhost/");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("fonts.bunny.net");
    });

    test("GET /index.html also works", async () => {
      const req = new Request("http://localhost/index.html");
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });
  });

  describe("Skill File", () => {
    test("GET /skill.md returns 200 status", async () => {
      const req = new Request("http://localhost/skill.md");
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });

    test("skill.md contains registration instructions", async () => {
      const req = new Request("http://localhost/skill.md");
      const res = await handleRequest(req);
      const text = await res.text();
      expect(text).toContain("Register");
      expect(text).toContain("/api/agents/register");
    });

    test("skill.md contains API usage instructions", async () => {
      const req = new Request("http://localhost/skill.md");
      const res = await handleRequest(req);
      const text = await res.text();
      expect(text).toContain("/api/products");
      expect(text).toContain("/api/requests/poll");
      expect(text).toContain("/api/pitches");
    });
  });

  describe("Requests Page", () => {
    test("GET /requests.html returns 200 status", async () => {
      const req = new Request("http://localhost/requests.html");
      const res = await handleRequest(req);
      expect(res.status).toBe(200);
    });

    test("requests page contains form to post request", async () => {
      const req = new Request("http://localhost/requests.html");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("request-form");
      expect(html).toContain("What Do You Seek");
      expect(html).toContain("Cast Into The Void");
    });

    test("requests page contains requests list section", async () => {
      const req = new Request("http://localhost/requests.html");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("requests-container");
      expect(html).toContain("Active Hunts");
    });

    test("requests page has JavaScript to load requests", async () => {
      const req = new Request("http://localhost/requests.html");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain("loadRequests()");
      expect(html).toContain("fetch(");
    });

    test("requests page links back to homepage", async () => {
      const req = new Request("http://localhost/requests.html");
      const res = await handleRequest(req);
      const html = await res.text();
      expect(html).toContain('href="/"');
    });
  });

  describe("Error Handling", () => {
    test("GET /nonexistent returns 404", async () => {
      const req = new Request("http://localhost/nonexistent-page.html");
      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });

    test("API 404 returns JSON, not HTML", async () => {
      const req = new Request("http://localhost/api/nonexistent");
      const res = await handleRequest(req);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body.error).toBe("Not found");
    });
  });

  describe("Static File Caching", () => {
    test("static files have proper caching headers and ETag support", async () => {
      // Test 1: Check headers exist
      const req1 = new Request("http://localhost/index.html");
      const res1 = await handleRequest(req1);
      
      expect(res1.status).toBe(200);
      expect(res1.headers.has("Cache-Control")).toBe(true);
      expect(res1.headers.has("ETag")).toBe(true);
      expect(res1.headers.has("Content-Type")).toBe(true);
      
      const etag = res1.headers.get("ETag")!;
      
      // Test 2: 304 response when ETag matches
      const req2 = new Request("http://localhost/index.html", {
        headers: { "If-None-Match": etag },
      });
      const res2 = await handleRequest(req2);
      expect(res2.status).toBe(304);
      
      // Test 3: 200 response when ETag doesn't match
      const req3 = new Request("http://localhost/index.html", {
        headers: { "If-None-Match": '"wrong"' },
      });
      const res3 = await handleRequest(req3);
      expect(res3.status).toBe(200);
    });
  });
});
