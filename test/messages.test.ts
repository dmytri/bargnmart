import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestHuman, createTestProductSimple, createTestAgentRequest } from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Messages API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/messages", () => {
    it("allows human to send message on product", async () => {
      const agent = await createTestAgent("Seller Bot");
      const human = await createTestHuman("Buyer");
      const product = await createTestProductSimple(agent.id, "Test Product");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${human.token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          text: "Is this still available?",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.product_id).toBe(product.id);
      expect(body.sender_type).toBe("human");
    });

    it("allows agent to send message on their own product", async () => {
      const agent = await createTestAgent("Reply Bot");
      const product = await createTestProductSimple(agent.id, "My Product");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agent.token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          text: "Thanks for your interest!",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.sender_type).toBe("agent");
    });

    it("rejects agent messaging on other agent product", async () => {
      const agent1 = await createTestAgent("Agent 1");
      const agent2 = await createTestAgent("Agent 2");
      const product = await createTestProductSimple(agent1.id, "Agent 1 Product");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agent2.token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          text: "Trying to spam your product",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(403);
    });

    it("allows agent to message on products pitched to their requests", async () => {
      // Agent A (buyer) posts a request
      const buyerAgent = await createTestAgent("Buyer Agent");
      const requestId = await createTestAgentRequest(buyerAgent.id, "Need widgets");

      // Agent B (seller) has a product and pitches it
      const sellerAgent = await createTestAgent("Seller Agent");
      const product = await createTestProductSimple(sellerAgent.id, "Widgets Inc");

      // Create the pitch
      const db = getDb();
      const pitchId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [pitchId, requestId, sellerAgent.id, product.id, "Great widgets!", now],
      });

      // Buyer agent should be able to message on seller's product
      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${buyerAgent.token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          text: "Tell me more about these widgets",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.sender_type).toBe("agent");
      expect(body.product_id).toBe(product.id);
    });

    it("requires authentication", async () => {
      const agent = await createTestAgent("Product Owner");
      const product = await createTestProductSimple(agent.id, "Auth Test Product");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          text: "Anonymous message",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("rejects message without product_id", async () => {
      const human = await createTestHuman("No Product Human");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${human.token}`,
        },
        body: JSON.stringify({ text: "Where does this go?" }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("rejects message without text", async () => {
      const agent = await createTestAgent("Empty Text Bot");
      const human = await createTestHuman("Empty Human");
      const product = await createTestProductSimple(agent.id, "Empty Product");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${human.token}`,
        },
        body: JSON.stringify({ product_id: product.id }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("rejects text over 2000 chars", async () => {
      const agent = await createTestAgent("Long Text Bot");
      const human = await createTestHuman("Verbose Human");
      const product = await createTestProductSimple(agent.id, "Long Product");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${human.token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          text: "x".repeat(2001),
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent product", async () => {
      const human = await createTestHuman("Ghost Hunter");

      const req = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${human.token}`,
        },
        body: JSON.stringify({
          product_id: "00000000-0000-0000-0000-000000000000",
          text: "Hello?",
        }),
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/messages/product/:productId", () => {
    it("returns messages for a product", async () => {
      const agent = await createTestAgent("Chat Bot");
      const human = await createTestHuman("Chatter");
      const product = await createTestProductSimple(agent.id, "Chat Product");

      // Send a message
      await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${human.token}`,
          },
          body: JSON.stringify({
            product_id: product.id,
            text: "First message",
          }),
        })
      );

      // Get messages
      const req = new Request(`http://localhost/api/messages/product/${product.id}`, {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].text).toBe("First message");
    });

    it("returns 404 for invalid product ID", async () => {
      const req = new Request("http://localhost/api/messages/product/not-a-uuid", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(404);
    });

    it("supports since parameter", async () => {
      const agent = await createTestAgent("Time Bot");
      const human = await createTestHuman("Time Human");
      const product = await createTestProductSimple(agent.id, "Time Product");

      // Send message
      await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${human.token}`,
          },
          body: JSON.stringify({
            product_id: product.id,
            text: "Old message",
          }),
        })
      );

      // Get messages with future since timestamp
      const futureTime = Math.floor(Date.now() / 1000) + 1000;
      const req = new Request(
        `http://localhost/api/messages/product/${product.id}?since=${futureTime}`,
        { method: "GET" }
      );

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.length).toBe(0);
    });
  });

  describe("GET /api/messages/poll", () => {
    it("returns messages from humans on agent products", async () => {
      const agent = await createTestAgent("Poll Bot");
      const human = await createTestHuman("Poller");
      const product = await createTestProductSimple(agent.id, "Poll Product");

      // Human sends message
      await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${human.token}`,
          },
          body: JSON.stringify({
            product_id: product.id,
            text: "Question about product",
          }),
        })
      );

      // Agent polls
      const req = new Request("http://localhost/api/messages/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agent.token}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].text).toBe("Question about product");
      expect(body[0].product_title).toBe("Poll Product");
    });

    it("requires agent authentication", async () => {
      const req = new Request("http://localhost/api/messages/poll", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });

    it("excludes agent own messages", async () => {
      const agent = await createTestAgent("Self Bot");
      const product = await createTestProductSimple(agent.id, "Self Product");

      // Agent sends message to own product
      await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agent.token}`,
          },
          body: JSON.stringify({
            product_id: product.id,
            text: "Talking to myself",
          }),
        })
      );

      // Agent polls - should not see own message
      const req = new Request("http://localhost/api/messages/poll", {
        method: "GET",
        headers: { Authorization: `Bearer ${agent.token}` },
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.length).toBe(0);
    });
  });

  describe("GET /api/messages/poll-buyer", () => {
    it("returns seller responses on products pitched to agent requests", async () => {
      // Buyer agent posts a request
      const buyerAgent = await createTestAgent("Buyer Bot");
      const requestId = await createTestAgentRequest(buyerAgent.id, "Need stuff");

      // Seller agent has a product
      const sellerAgent = await createTestAgent("Seller Bot");
      const product = await createTestProductSimple(sellerAgent.id, "Cool Stuff");

      // Seller pitches to buyer's request
      const db = getDb();
      const pitchId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [pitchId, requestId, sellerAgent.id, product.id, "Great stuff!", now],
      });

      // Seller sends a message on their product (follow-up to pitch)
      await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sellerAgent.token}`,
          },
          body: JSON.stringify({
            product_id: product.id,
            text: "Hey, interested in this?",
          }),
        })
      );

      // Buyer polls for seller messages
      const req = new Request("http://localhost/api/messages/poll-buyer", {
        method: "GET",
        headers: { Authorization: `Bearer ${buyerAgent.token}` },
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].text).toBe("Hey, interested in this?");
      expect(body[0].product_title).toBe("Cool Stuff");
      expect(body[0].seller_name).toBe("Seller Bot");
    });

    it("excludes buyer own messages", async () => {
      // Buyer agent posts a request
      const buyerAgent = await createTestAgent("Chatty Buyer");
      const requestId = await createTestAgentRequest(buyerAgent.id, "Need things");

      // Seller agent has a product
      const sellerAgent = await createTestAgent("Quiet Seller");
      const product = await createTestProductSimple(sellerAgent.id, "Things");

      // Seller pitches
      const db = getDb();
      const pitchId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute({
        sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [pitchId, requestId, sellerAgent.id, product.id, "Things here!", now],
      });

      // Buyer sends a message (using our new permission)
      await handleRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${buyerAgent.token}`,
          },
          body: JSON.stringify({
            product_id: product.id,
            text: "Is this good?",
          }),
        })
      );

      // Buyer polls - should NOT see their own message
      const req = new Request("http://localhost/api/messages/poll-buyer", {
        method: "GET",
        headers: { Authorization: `Bearer ${buyerAgent.token}` },
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.length).toBe(0);
    });

    it("requires agent authentication", async () => {
      const req = new Request("http://localhost/api/messages/poll-buyer", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(401);
    });
  });
});
