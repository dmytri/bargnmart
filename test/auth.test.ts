import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables } from "./setup";
import { handleRequest } from "../src/server";

describe("Human Auth API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/auth/signup", () => {
    test("creates a new human account", async () => {
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.human_id).toBeDefined();
    });

    test("rejects duplicate email", async () => {
      const body = JSON.stringify({
        email: "dupe@example.com",
        password: "password123",
      });

      // First signup
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );

      // Second signup with same email
      const res = await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.error).toContain("already registered");
    });

    test("rejects invalid email", async () => {
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "password123",
        }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    test("rejects short password", async () => {
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "short",
        }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("8 characters");
    });
  });

  describe("POST /api/auth/login", () => {
    test("logs in existing user", async () => {
      // Create user first
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "login@example.com",
            password: "password123",
          }),
        })
      );

      // Login
      const res = await handleRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "login@example.com",
            password: "password123",
          }),
        })
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.human_id).toBeDefined();
    });

    test("rejects wrong password", async () => {
      // Create user first
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "wrongpw@example.com",
            password: "password123",
          }),
        })
      );

      // Login with wrong password
      const res = await handleRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "wrongpw@example.com",
            password: "wrongpassword",
          }),
        })
      );
      expect(res.status).toBe(401);
    });

    test("rejects non-existent user", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "noexist@example.com",
            password: "password123",
          }),
        })
      );
      expect(res.status).toBe(401);
    });
  });
});
