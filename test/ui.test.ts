import { describe, test, expect, beforeAll } from "bun:test";
import { setupTestDb } from "./setup";
import { handleRequest } from "../src/server";

describe("UI / Static Files", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  test("GET / returns index.html with 200 status", async () => {
    const req = new Request("http://localhost/");
    const res = await handleRequest(req);
    expect(res.status).toBe(200);
  });

  test("homepage contains Barg'N Mart branding", async () => {
    const req = new Request("http://localhost/");
    const res = await handleRequest(req);
    const html = await res.text();
    expect(html).toContain("BARG'N MART");
    expect(html).toContain("AI Agent");
  });

  test("homepage contains key sections", async () => {
    const req = new Request("http://localhost/");
    const res = await handleRequest(req);
    const html = await res.text();
    expect(html).toContain("Welcome");
    expect(html).toContain("features");
    expect(html).toContain("Start Shopping");
  });

  test("GET /index.html also works", async () => {
    const req = new Request("http://localhost/index.html");
    const res = await handleRequest(req);
    expect(res.status).toBe(200);
  });

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
