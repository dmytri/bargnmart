import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestAgent, createTestRequestSimple, createTestProductSimple } from "./setup";
import { handleRequest } from "../src/server";
import { getDb } from "../src/db/client";

describe("Feed API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("GET /api/feed", () => {
    it("returns empty array when no pitches", async () => {
      const req = new Request("http://localhost/api/feed", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    it("returns recent pitches with agent and request info", async () => {
      const agent = await createTestAgent("Feed Bot");
      const request = await createTestRequestSimple("I need something");
      const product = await createTestProductSimple(agent.id, "Feed Product");

      // Create a pitch
      const pitchReq = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agent.token}`,
        },
        body: JSON.stringify({
          request_id: request.id,
          product_id: product.id,
          pitch_text: "Buy this amazing thing!",
        }),
      });
      await handleRequest(pitchReq);

      // Get feed
      const req = new Request("http://localhost/api/feed", {
        method: "GET",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].pitch_text).toBe("Buy this amazing thing!");
      expect(body[0].agent_name).toBe("Feed Bot");
      expect(body[0].request_text).toBe("I need something");
    });

    it("excludes hidden pitches", async () => {
      const agent = await createTestAgent("Hidden Bot");
      const request = await createTestRequestSimple("Show me stuff");
      const product = await createTestProductSimple(agent.id, "Hidden Product");

      // Create a pitch
      const pitchReq = new Request("http://localhost/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agent.token}`,
        },
        body: JSON.stringify({
          request_id: request.id,
          product_id: product.id,
          pitch_text: "This will be hidden",
        }),
      });
      const pitchRes = await handleRequest(pitchReq);
      const { id: pitchId } = await pitchRes.json();

      // Hide the pitch
      const db = getDb();
      await db.execute({
        sql: `UPDATE pitches SET hidden = 1 WHERE id = ?`,
        args: [pitchId],
      });

      // Get feed
      const req = new Request("http://localhost/api/feed", {
        method: "GET",
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.length).toBe(0);
    });

    it("returns 405 for non-GET methods", async () => {
      const req = new Request("http://localhost/api/feed", {
        method: "POST",
      });

      const res = await handleRequest(req);
      expect(res.status).toBe(405);
    });

    it("limits to 50 pitches", async () => {
      const agent = await createTestAgent("Bulk Bot");
      const product = await createTestProductSimple(agent.id, "Bulk Product");
      const db = getDb();

      // Create 60 pitches directly
      for (let i = 0; i < 60; i++) {
        const request = await createTestRequestSimple(`Request ${i}`);
        const now = Math.floor(Date.now() / 1000);
        await db.execute({
          sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [crypto.randomUUID(), request.id, agent.id, product.id, `Pitch ${i}`, now + i],
        });
      }

      const req = new Request("http://localhost/api/feed", {
        method: "GET",
      });

      const res = await handleRequest(req);
      const body = await res.json();
      expect(body.length).toBe(50);
    });
  });
});
