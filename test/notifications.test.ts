import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  setupTestDb,
  truncateTables,
  getDb,
  createTestHuman,
  createTestAgent,
  createTestRequest,
  createTestProduct,
} from "./setup";

// Import server handler
const serverModule = await import("../src/server");
const handleRequest =
  serverModule.handleRequest ||
  ((req: Request) => serverModule.default.fetch(req));

describe("Notifications API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("GET /api/notifications", () => {
    test("requires authentication", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/notifications")
      );
      expect(res.status).toBe(401);
    });

    test("returns zero counts for user with no activity", async () => {
      const human = await createTestHuman("TestUser");

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pitches).toBe(0);
      expect(data.messages).toBe(0);
      expect(data.total).toBe(0);
    });

    test("counts new pitches on user's open requests", async () => {
      const human = await createTestHuman("Requester");
      const agent = await createTestAgent("PitchBot");
      const deleteToken = crypto.randomUUID();
      const requestId = await createTestRequest(
        human.id,
        "Looking for widgets",
        deleteToken
      );

      // Agent creates a pitch
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, "I have widgets!", now],
      });

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pitches).toBe(1);
      expect(data.total).toBe(1);
    });

    test("does not count pitches on closed requests", async () => {
      const human = await createTestHuman("Requester");
      const agent = await createTestAgent("PitchBot");
      const deleteToken = crypto.randomUUID();
      const requestId = await createTestRequest(
        human.id,
        "Looking for widgets",
        deleteToken
      );

      // Close the request
      const db = getDb();
      await db.execute({
        sql: `UPDATE requests SET status = 'resolved' WHERE id = ?`,
        args: [requestId],
      });

      // Agent creates a pitch
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, "I have widgets!", now],
      });

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pitches).toBe(0);
    });

    test("does not count hidden pitches", async () => {
      const human = await createTestHuman("Requester");
      const agent = await createTestAgent("PitchBot");
      const deleteToken = crypto.randomUUID();
      const requestId = await createTestRequest(
        human.id,
        "Looking for widgets",
        deleteToken
      );

      // Agent creates a hidden pitch
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, hidden, created_at)
              VALUES (?, ?, ?, ?, 1, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, "Hidden pitch", now],
      });

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pitches).toBe(0);
    });

    test("counts new messages in threads user participated in", async () => {
      const human = await createTestHuman("Buyer");
      const agent = await createTestAgent("Seller");
      const productId = await createTestProduct(agent.id, "prod-1", "Widget");

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);

      // Human sends a message (participates in thread)
      await db.execute({
        sql: `INSERT INTO messages (id, product_id, sender_type, sender_id, text, created_at)
              VALUES (?, ?, 'human', ?, ?, ?)`,
        args: [crypto.randomUUID(), productId, human.id, "Is this available?", now - 100],
      });

      // Agent replies (this should be counted as new)
      await db.execute({
        sql: `INSERT INTO messages (id, product_id, sender_type, sender_id, text, created_at)
              VALUES (?, ?, 'agent', ?, ?, ?)`,
        args: [crypto.randomUUID(), productId, agent.id, "Yes it is!", now],
      });

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.messages).toBe(1);
      expect(data.total).toBe(1);
    });

    test("does not count user's own messages", async () => {
      const human = await createTestHuman("Buyer");
      const agent = await createTestAgent("Seller");
      const productId = await createTestProduct(agent.id, "prod-1", "Widget");

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);

      // Human sends multiple messages
      await db.execute({
        sql: `INSERT INTO messages (id, product_id, sender_type, sender_id, text, created_at)
              VALUES (?, ?, 'human', ?, ?, ?)`,
        args: [crypto.randomUUID(), productId, human.id, "Question 1", now - 100],
      });
      await db.execute({
        sql: `INSERT INTO messages (id, product_id, sender_type, sender_id, text, created_at)
              VALUES (?, ?, 'human', ?, ?, ?)`,
        args: [crypto.randomUUID(), productId, human.id, "Question 2", now],
      });

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.messages).toBe(0);
    });

    test("respects last_seen timestamp", async () => {
      const human = await createTestHuman("Requester");
      const agent = await createTestAgent("PitchBot");
      const deleteToken = crypto.randomUUID();
      const requestId = await createTestRequest(
        human.id,
        "Looking for widgets",
        deleteToken
      );

      const db = getDb();
      const now = Math.floor(Date.now() / 1000);

      // Set last_seen to now
      await db.execute({
        sql: `UPDATE humans SET last_seen_notifications = ? WHERE id = ?`,
        args: [now, human.id],
      });

      // Create pitch BEFORE last_seen (should not count)
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, "Old pitch", now - 100],
      });

      // Create pitch AFTER last_seen (should count)
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, "New pitch", now + 100],
      });

      const res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pitches).toBe(1);
    });
  });

  describe("POST /api/notifications/seen", () => {
    test("requires authentication", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/notifications/seen", {
          method: "POST",
        })
      );
      expect(res.status).toBe(401);
    });

    test("updates last_seen timestamp", async () => {
      const human = await createTestHuman("TestUser");
      const db = getDb();

      // Check initial last_seen is 0
      const before = await db.execute({
        sql: `SELECT last_seen_notifications FROM humans WHERE id = ?`,
        args: [human.id],
      });
      expect(Number(before.rows[0]?.last_seen_notifications)).toBe(0);

      // Mark as seen
      const res = await handleRequest(
        new Request("http://localhost/api/notifications/seen", {
          method: "POST",
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.last_seen).toBeGreaterThan(0);

      // Verify in database
      const after = await db.execute({
        sql: `SELECT last_seen_notifications FROM humans WHERE id = ?`,
        args: [human.id],
      });
      expect(Number(after.rows[0]?.last_seen_notifications)).toBe(data.last_seen);
    });

    test("clears notification count after marking seen", async () => {
      const human = await createTestHuman("Requester");
      const agent = await createTestAgent("PitchBot");
      const deleteToken = crypto.randomUUID();
      const requestId = await createTestRequest(
        human.id,
        "Looking for widgets",
        deleteToken
      );

      // Create a pitch
      const db = getDb();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), requestId, agent.id, "I have widgets!", now],
      });

      // Check we have 1 notification
      let res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );
      let data = await res.json();
      expect(data.pitches).toBe(1);

      // Mark as seen
      await handleRequest(
        new Request("http://localhost/api/notifications/seen", {
          method: "POST",
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );

      // Check notifications are now 0
      res = await handleRequest(
        new Request("http://localhost/api/notifications", {
          headers: { Authorization: `Bearer ${human.token}` },
        })
      );
      data = await res.json();
      expect(data.pitches).toBe(0);
      expect(data.total).toBe(0);
    });
  });
});

describe("Requests API - requester_id filter", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  test("filters requests by requester_id", async () => {
    const human1 = await createTestHuman("User1");
    const human2 = await createTestHuman("User2");

    // Create requests for both humans
    await createTestRequest(human1.id, "Request from user 1", crypto.randomUUID());
    await createTestRequest(human1.id, "Another from user 1", crypto.randomUUID());
    await createTestRequest(human2.id, "Request from user 2", crypto.randomUUID());

    // Get all requests
    let res = await handleRequest(
      new Request("http://localhost/api/requests")
    );
    let data = await res.json();
    expect(data.length).toBe(3);

    // Filter by human1's requester_id
    res = await handleRequest(
      new Request(`http://localhost/api/requests?requester_id=${human1.id}`)
    );
    data = await res.json();
    expect(data.length).toBe(2);
    expect(data.every((r: any) => r.requester_id === human1.id)).toBe(true);

    // Filter by human2's requester_id
    res = await handleRequest(
      new Request(`http://localhost/api/requests?requester_id=${human2.id}`)
    );
    data = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].requester_id).toBe(human2.id);
  });

  test("returns empty array for non-existent requester_id", async () => {
    const human = await createTestHuman("User1");
    await createTestRequest(human.id, "A request", crypto.randomUUID());

    const res = await handleRequest(
      new Request(`http://localhost/api/requests?requester_id=${crypto.randomUUID()}`)
    );
    const data = await res.json();
    expect(data.length).toBe(0);
  });
});
