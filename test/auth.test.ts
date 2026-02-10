import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgentWithToken, createTestProduct, createTestHumanWithAuth } from "./setup";
import { handleRequest } from "../src/server";

describe("Human Auth API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/auth/signup", () => {
    test("creates a new human account with display_name", async () => {
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
          display_name: "TestUser",
        }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.human_id).toBeDefined();
      expect(data.display_name).toBe("TestUser");
    });

    test("requires display_name", async () => {
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Display name");
    });

    test("rejects duplicate email", async () => {
      // First signup
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "dupe@example.com",
            password: "password123",
            display_name: "User1",
          }),
        })
      );

      // Second signup with same email
      const res = await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "dupe@example.com",
            password: "password123",
            display_name: "User2",
          }),
        })
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("already registered");
    });

    test("rejects duplicate display_name (case insensitive)", async () => {
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "user1@example.com",
            password: "password123",
            display_name: "CoolName",
          }),
        })
      );

      const res = await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "user2@example.com",
            password: "password123",
            display_name: "COOLNAME",
          }),
        })
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("Display name already taken");
    });

    test("rejects invalid email", async () => {
      const req = new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "password123",
          display_name: "TestUser",
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
          display_name: "TestUser",
        }),
      });
      const res = await handleRequest(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("8 characters");
    });
  });

  describe("POST /api/auth/login", () => {
    test("logs in and returns display_name", async () => {
      // Create user first
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "login@example.com",
            password: "password123",
            display_name: "LoginUser",
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
      expect(data.display_name).toBe("LoginUser");
    });

    test("rejects wrong password", async () => {
      await handleRequest(
        new Request("http://localhost/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "wrongpw@example.com",
            password: "password123",
            display_name: "WrongPwUser",
          }),
        })
      );

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

describe("Human Auth Required", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("Requests", () => {
    test("POST /api/requests requires login", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Looking for something" }),
        })
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Login required");
    });

    test("POST /api/requests works with valid human token", async () => {
      await createTestHumanWithAuth("Buyer", "human-token");

      const res = await handleRequest(
        new Request("http://localhost/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer human-token",
          },
          body: JSON.stringify({ text: "Looking for something" }),
        })
      );
      expect(res.status).toBe(201);
    });

    test("POST /api/requests rejects invalid token", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid-token",
          },
          body: JSON.stringify({ text: "Looking for something" }),
        })
      );
      expect(res.status).toBe(401);
    });
  });

  describe("Messages", () => {
    test("POST /api/messages requires login", async () => {
      const agentId = await createTestAgentWithToken("agent-token");
      const productId = await createTestProduct(agentId, "prod-1", "Product");

      const res = await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId, text: "Question?" }),
        })
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Login required");
    });

    test("POST /api/messages works with valid human token", async () => {
      const agentId = await createTestAgentWithToken("agent-token");
      const productId = await createTestProduct(agentId, "prod-1", "Product");
      await createTestHumanWithAuth("Buyer", "human-token");

      const res = await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer human-token",
          },
          body: JSON.stringify({ product_id: productId, text: "Is this available?" }),
        })
      );
      expect(res.status).toBe(201);
    });
  });
});

describe("Human Names Visible on Posts", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  test("human_name shown in message list", async () => {
    const agentId = await createTestAgentWithToken("agent-token");
    const productId = await createTestProduct(agentId, "prod-1", "Product");
    await createTestHumanWithAuth("CoolBuyer", "human-token");

    // Human sends message
    await handleRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer human-token",
        },
        body: JSON.stringify({ product_id: productId, text: "Hello!" }),
      })
    );

    // Get messages - should show human_name
    const res = await handleRequest(
      new Request(`http://localhost/api/messages/product/${productId}`)
    );
    const messages = await res.json();
    expect(messages.length).toBe(1);
    expect(messages[0].human_name).toBe("CoolBuyer");
    expect(messages[0].sender_type).toBe("human");
  });

  test("human_name shown in agent poll", async () => {
    const agentId = await createTestAgentWithToken("agent-token");
    const productId = await createTestProduct(agentId, "prod-1", "Product");
    await createTestHumanWithAuth("PollBuyer", "human-token");

    // Human sends message
    await handleRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer human-token",
        },
        body: JSON.stringify({ product_id: productId, text: "Question!" }),
      })
    );

    // Agent polls for messages
    const res = await handleRequest(
      new Request("http://localhost/api/messages/poll?since=0", {
        headers: { Authorization: "Bearer agent-token" },
      })
    );
    const messages = await res.json();
    expect(messages.length).toBe(1);
    expect(messages[0].sender_name).toBe("PollBuyer");
    expect(messages[0].sender_type).toBe("human");
  });
});

describe("Agent Endpoints Auth Required", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  test("PUT /api/products requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: "prod-1", title: "Product" }),
      })
    );
    expect(res.status).toBe(401);
  });

  test("GET /api/products/mine requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/products/mine")
    );
    expect(res.status).toBe(401);
  });

  test("DELETE /api/products/:id requires agent auth", async () => {
    const agentId = await createTestAgentWithToken("agent-token");
    const productId = await createTestProduct(agentId, "prod-1", "Product");

    const res = await handleRequest(
      new Request(`http://localhost/api/products/${productId}`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/pitches requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: crypto.randomUUID(), pitch_text: "Buy!" }),
      })
    );
    expect(res.status).toBe(401);
  });

  test("GET /api/pitches/mine requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/pitches/mine")
    );
    expect(res.status).toBe(401);
  });

  test("GET /api/requests/poll requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/requests/poll")
    );
    expect(res.status).toBe(401);
  });

  test("GET /api/messages/poll requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/messages/poll")
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/ratings requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ human_id: crypto.randomUUID(), score: 5 }),
      })
    );
    expect(res.status).toBe(401);
  });

  test("GET /api/reputation/mine requires agent auth", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/reputation/mine")
    );
    expect(res.status).toBe(401);
  });

  test("human token cannot access agent endpoints", async () => {
    await createTestHumanWithAuth("Human", "human-token");

    const res = await handleRequest(
      new Request("http://localhost/api/products", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer human-token",
        },
        body: JSON.stringify({ external_id: "prod-1", title: "Product" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
