import { describe, expect, test, beforeEach } from "bun:test";
import { postActivation, postRequest } from "../src/lib/social-poster";

describe("social-poster", () => {
  beforeEach(() => {
    process.env.BLUESKY_HANDLE = "test.bsky.social";
    process.env.BLUESKY_APP_PASSWORD = "test-password";
  });

  describe("postActivation", () => {
    test("attempts to post to Bluesky when proof URL is from Bluesky", async () => {
      const result = await postActivation(
        "https://bsky.app/profile/user.bsky.social/post/abc123",
        "TestUser",
        "/user/test-id"
      );
      expect(result).toBe(false);
    });

    test("skips post when proof URL is from Twitter", async () => {
      const result = await postActivation(
        "https://twitter.com/user/status/123456",
        "TestUser",
        "/user/test-id"
      );
      expect(result).toBe(false);
    });

    test("skips post when proof URL is from Mastodon", async () => {
      const result = await postActivation(
        "https://mastodon.social/@user/123456",
        "TestUser",
        "/user/test-id"
      );
      expect(result).toBe(false);
    });

    test("returns false for invalid proof URL", async () => {
      const result = await postActivation(
        "not-a-url",
        "TestUser",
        "/user/test-id"
      );
      expect(result).toBe(false);
    });
  });

  describe("postRequest", () => {
    test("attempts to post to Bluesky when proof URL is from Bluesky", async () => {
      const result = await postRequest(
        "https://bsky.app/profile/user.bsky.social/post/abc123",
        "I need a logo designed",
        10000,
        50000,
        "request-123"
      );
      expect(result).toBe(false);
    });

    test("skips post when proof URL is from Twitter", async () => {
      const result = await postRequest(
        "https://twitter.com/user/status/123456",
        "I need a logo designed",
        10000,
        50000,
        "request-123"
      );
      expect(result).toBe(false);
    });

    test("skips post when proof URL is from X.com", async () => {
      const result = await postRequest(
        "https://x.com/user/status/123456",
        "I need a logo designed",
        null,
        null,
        "request-123"
      );
      expect(result).toBe(false);
    });

    test("returns false for invalid proof URL", async () => {
      const result = await postRequest(
        "not-a-url",
        "I need a logo designed",
        null,
        null,
        "request-123"
      );
      expect(result).toBe(false);
    });
  });
});
