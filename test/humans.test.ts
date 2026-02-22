import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { setupTestDb, truncateTables, createTestHumanWithAuth, createTestAgent, getDb } from "./setup";
import { handleRequest } from "../src/server";

describe("Human Profile API", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe("POST /api/auth/register", () => {
    test("creates pending account with display_name only", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "NewUser" }),
        })
      );
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.human_id).toBeDefined();
      expect(data.display_name).toBe("NewUser");
      expect(data.status).toBe("pending");
      expect(data.profile_url).toContain("/user/");
      expect(data.message).toContain("social media");
    });

    test("rejects short display_name", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "X" }),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("2 characters");
    });

    test("rejects long display_name", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "A".repeat(51) }),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("50 characters");
    });

    test("rejects invalid display_name characters", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "User@Name!" }),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("letters, numbers");
    });

    test("rejects duplicate display_name (case insensitive)", async () => {
      await handleRequest(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "TakenName" }),
        })
      );

      const res = await handleRequest(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "takenname" }),
        })
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("already taken");
    });
  });

  describe("GET /api/auth/me", () => {
    test("returns current user info for pending account", async () => {
      const humanId = await createTestHumanWithAuth("TestHuman", "test-token", "pending");

      const res = await handleRequest(
        new Request("http://localhost/api/auth/me", {
          headers: { Authorization: "Bearer test-token" },
        })
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(humanId);
      expect(data.display_name).toBe("TestHuman");
      expect(data.status).toBe("pending");
      expect(data.profile_url).toBe(`/user/${humanId}`);
      expect(data.claim_url).toBe(`/user/${humanId}#claim`);
      expect(data.message).toContain("social media");
      expect(data.stats).toBeDefined();
    });

    test("returns different message for active account", async () => {
      await createTestHumanWithAuth("ActiveUser", "active-token", "active");

      const res = await handleRequest(
        new Request("http://localhost/api/auth/me", {
          headers: { Authorization: "Bearer active-token" },
        })
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("active");
      expect(data.message).toContain("all set");
      expect(data.claim_url).toBeUndefined();
    });

    test("requires authentication", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/me")
      );
      expect(res.status).toBe(401);
    });

    test("rejects invalid token", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/auth/me", {
          headers: { Authorization: "Bearer invalid-token" },
        })
      );
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/humans/:id", () => {
    test("returns public profile info", async () => {
      const humanId = await createTestHumanWithAuth("PublicUser", "test-token", "active");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}`)
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(humanId);
      expect(data.display_name).toBe("PublicUser");
      expect(data.status).toBe("active");
      expect(data.stats).toBeDefined();
      // Should not expose private info
      expect(data.token).toBeUndefined();
      expect(data.email_hash).toBeUndefined();
    });

    test("returns 404 for non-existent user", async () => {
      const res = await handleRequest(
        new Request("http://localhost/api/humans/00000000-0000-0000-0000-000000000000")
      );
      expect(res.status).toBe(404);
    });

    test("includes request count in stats", async () => {
      const humanId = await createTestHumanWithAuth("RequestUser", "human-token", "active");

      // Create some requests
      await handleRequest(
        new Request("http://localhost/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer human-token",
          },
          body: JSON.stringify({ text: "Request 1" }),
        })
      );
      await handleRequest(
        new Request("http://localhost/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer human-token",
          },
          body: JSON.stringify({ text: "Request 2" }),
        })
      );

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}`)
      );
      const data = await res.json();
      expect(data.stats.request_count).toBe(2);
    });
  });

  describe("POST /api/humans/:id/claim", () => {
    test("activates pending account with valid proof URL", async () => {
      const humanId = await createTestHumanWithAuth("ClaimUser", "claim-token", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer claim-token",
          },
          body: JSON.stringify({ proof_url: "https://twitter.com/user/status/123456" }),
        })
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("active");
      expect(data.message).toContain("activated");

      // Verify in database
      const db = getDb();
      const result = await db.execute({
        sql: "SELECT status, claimed_proof_url FROM humans WHERE id = ?",
        args: [humanId],
      });
      expect(result.rows[0].status).toBe("active");
      expect(result.rows[0].claimed_proof_url).toBe("https://twitter.com/user/status/123456");
    });

    test("rejects claim without authentication", async () => {
      const humanId = await createTestHumanWithAuth("NoAuthUser", "no-auth-token", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proof_url: "https://twitter.com/user/status/123" }),
        })
      );
      expect(res.status).toBe(401);
    });

    test("rejects claim for different user's profile", async () => {
      const humanId1 = await createTestHumanWithAuth("User1", "token1", "pending");
      await createTestHumanWithAuth("User2", "token2", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId1}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer token2", // Wrong user's token
          },
          body: JSON.stringify({ proof_url: "https://twitter.com/user/status/123" }),
        })
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("own profile");
    });

    test("rejects claim without proof URL", async () => {
      const humanId = await createTestHumanWithAuth("NoProofUser", "noproof-token", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer noproof-token",
          },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("proof_url");
    });

    test("rejects claim with invalid URL", async () => {
      const humanId = await createTestHumanWithAuth("BadUrlUser", "badurl-token", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer badurl-token",
          },
          body: JSON.stringify({ proof_url: "not-a-url" }),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("URL");
    });

    test("rejects claim with non-https URL", async () => {
      const humanId = await createTestHumanWithAuth("HttpUser", "http-token", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer http-token",
          },
          body: JSON.stringify({ proof_url: "http://twitter.com/user/status/123" }),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("HTTPS");
    });

    test("rejects claim for already active account", async () => {
      const humanId = await createTestHumanWithAuth("AlreadyActive", "already-token", "active");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer already-token",
          },
          body: JSON.stringify({ proof_url: "https://twitter.com/user/status/123" }),
        })
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("claimed");
    });

    test("activates with Bluesky proof URL", async () => {
      const humanId = await createTestHumanWithAuth("BlueskyUser", "bluesky-token", "pending");

      const res = await handleRequest(
        new Request(`http://localhost/api/humans/${humanId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer bluesky-token",
          },
          body: JSON.stringify({ proof_url: "https://bsky.app/profile/handle.bsky.social/post/abc123" }),
        })
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("active");
      expect(data.message).toContain("activated");

      // Verify in database
      const db = getDb();
      const result = await db.execute({
        sql: "SELECT status, claimed_proof_url FROM humans WHERE id = ?",
        args: [humanId],
      });
      expect(result.rows[0].status).toBe("active");
      expect(result.rows[0].claimed_proof_url).toBe("https://bsky.app/profile/handle.bsky.social/post/abc123");
    });
  });
});

describe("Human Status Enforcement", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  test("pending account cannot create requests", async () => {
    await createTestHumanWithAuth("PendingUser", "pending-token", "pending");

    const res = await handleRequest(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer pending-token",
        },
        body: JSON.stringify({ text: "I want to buy something" }),
      })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("not activated");
    expect(data.activate_url).toBeDefined();
    expect(data.profile_url).toBeDefined();
  });

  test("active account can create requests", async () => {
    await createTestHumanWithAuth("ActiveUser", "active-token", "active");

    const res = await handleRequest(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer active-token",
        },
        body: JSON.stringify({ text: "I want to buy something" }),
      })
    );
    expect(res.status).toBe(201);
  });

  test("suspended account cannot create requests", async () => {
    await createTestHumanWithAuth("SuspendedUser", "suspended-token", "suspended");

    const res = await handleRequest(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer suspended-token",
        },
        body: JSON.stringify({ text: "I want to buy something" }),
      })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("suspended");
  });

  test("legacy account cannot create requests", async () => {
    await createTestHumanWithAuth("LegacyUser", "legacy-token", "legacy");

    const res = await handleRequest(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer legacy-token",
        },
        body: JSON.stringify({ text: "I want to buy something" }),
      })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Legacy");
    expect(data.register_url).toBeDefined();
  });

  test("null status account cannot create requests (treated as legacy)", async () => {
    // Create human directly with null status to simulate missing migration
    const humanId = crypto.randomUUID();
    // Use SHA256 hash like the auth middleware does
    const hash = new Bun.CryptoHasher("sha256");
    hash.update("null-status-token");
    const tokenHash = hash.digest("hex");
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO humans (id, display_name, token_hash, created_at) VALUES (?, ?, ?, ?)`,
      args: [humanId, "NullStatusUser", tokenHash, Math.floor(Date.now() / 1000)],
    });
    // Status is DEFAULT 'legacy' per schema, but let's explicitly set to NULL
    await db.execute({
      sql: `UPDATE humans SET status = NULL WHERE id = ?`,
      args: [humanId],
    });

    const res = await handleRequest(
      new Request("http://localhost/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer null-status-token",
        },
        body: JSON.stringify({ text: "I want to buy something" }),
      })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Legacy");
  });

  test("signup returns pending status", async () => {
    const res = await handleRequest(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
          display_name: "NewSignup",
        }),
      })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("pending");
  });

  test("login returns current status", async () => {
    // Create active user via signup then update status
    const signupRes = await handleRequest(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login@example.com",
          password: "password123",
          display_name: "LoginTest",
        }),
      })
    );
    const signupData = await signupRes.json();

    // Update to active
    const db = getDb();
    await db.execute({
      sql: "UPDATE humans SET status = 'active' WHERE id = ?",
      args: [signupData.human_id],
    });

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
    expect(data.status).toBe("active");
    expect(data.profile_url).toBeDefined();
  });
});

describe("User Profile Page Routing", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  test("serves user.html for /user/:id path", async () => {
    const res = await handleRequest(
      new Request("http://localhost/user/12345678-1234-1234-1234-123456789abc")
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("User Profile");
    expect(html).toContain("Barg'N Monster");
  });
});



describe("Social Embed API Fields", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  test("GET /api/humans/:id returns claimed social fields for activated human", async () => {
    const humanId = await createTestHumanWithAuth("ClaimedUser", "claimed-token", "active");
    
    // Manually set claimed fields in DB (simulating successful claim)
    const db = getDb();
    await db.execute({
      sql: `UPDATE humans SET claimed_at = ?, claimed_proof_url = ? WHERE id = ?`,
      args: [Math.floor(Date.now() / 1000), "https://bsky.app/profile/test.bsky.social/post/abc123", humanId],
    });

    const res = await handleRequest(
      new Request(`http://localhost/api/humans/${humanId}`)
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.claimed_at).toBeDefined();
    expect(data.claimed_proof_url).toBe("https://bsky.app/profile/test.bsky.social/post/abc123");
    expect(data.claimed_platform).toBe("bluesky");
    expect(data.claimed_handle).toBe("test.bsky.social");
    expect(data.claimed_profile_url).toContain("bsky.app/profile/test.bsky.social");
  });

  test("GET /api/agents/:id returns claimed social fields for activated agent", async () => {
    const agent = await createTestAgent("Claimed Bot");
    
    // Manually set claimed fields in DB (simulating successful claim)
    const db = getDb();
    await db.execute({
      sql: `UPDATE agents SET claimed_at = ?, claimed_proof_url = ? WHERE id = ?`,
      args: [Math.floor(Date.now() / 1000), "https://bsky.app/profile/test.bsky.social/post/xyz789", agent.id],
    });

    const req = new Request(`http://localhost/api/agents/${agent.id}`, {
      method: "GET",
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.claimed_at).toBeDefined();
    expect(body.claimed_proof_url).toBe("https://bsky.app/profile/test.bsky.social/post/xyz789");
    expect(body.claimed_platform).toBe("bluesky");
    expect(body.claimed_handle).toBe("test.bsky.social");
    expect(body.claimed_profile_url).toContain("bsky.app/profile/test.bsky.social");
  });
});
