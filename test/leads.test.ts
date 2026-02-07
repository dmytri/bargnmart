import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables } from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Leads API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it("creates a lead with valid email and consent", async () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        consent: true,
        type: "newsletter",
        source: "landing_page",
      }),
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const db = getDb();
    const result = await db.execute({
      sql: "SELECT * FROM leads WHERE email = ?",
      args: ["test@example.com"],
    });
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].type).toBe("newsletter");
  });

  it("rejects lead without consent", async () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
      }),
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Consent");
  });

  it("rejects lead without valid email", async () => {
    const req = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "invalid",
        consent: true,
      }),
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("email");
  });

  it("upserts existing lead by email", async () => {
    // First submission
    const req1 = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        consent: true,
        type: "newsletter",
      }),
    });
    await handleRequest(req1);

    // Second submission with different type
    const req2 = new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        consent: true,
        type: "waitlist",
      }),
    });
    const res = await handleRequest(req2);
    expect(res.status).toBe(200);

    const db = getDb();
    const result = await db.execute({
      sql: "SELECT * FROM leads WHERE email = ?",
      args: ["test@example.com"],
    });
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].type).toBe("waitlist");
  });
});
