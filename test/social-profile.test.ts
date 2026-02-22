import { describe, test, expect } from "bun:test";
import { extractProfileFromPost, fetchPlatformProfile } from "../src/lib/social";

describe("Social Profile Fetching", () => {
  describe("fetchPlatformProfile", () => {
    test("returns profile for bluesky", async () => {
      const profile = {
        platform: "bluesky" as const,
        profileUrl: "https://bsky.app/profile/test.handle",
        handle: "test.handle",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("bluesky");
    });

    test("returns profile for mastodon", async () => {
      const profile = {
        platform: "mastodon" as const,
        profileUrl: "https://mastodon.social/@testuser",
        handle: "@testuser@mastodon.social",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("mastodon");
    });

    test("returns profile for twitter", async () => {
      const profile = {
        platform: "twitter" as const,
        profileUrl: "https://x.com/testuser",
        handle: "@testuser",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("twitter");
    });

    test("returns profile for threads", async () => {
      const profile = {
        platform: "threads" as const,
        profileUrl: "https://threads.net/@testuser",
        handle: "testuser",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("threads");
    });

    test("returns profile for instagram", async () => {
      const profile = {
        platform: "instagram" as const,
        profileUrl: "https://instagram.com/testuser",
        handle: "testuser",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("instagram");
    });

    test("returns profile for linkedin", async () => {
      const profile = {
        platform: "linkedin" as const,
        profileUrl: "https://linkedin.com/in/testuser",
        handle: "testuser",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("linkedin");
    });

    test("returns profile for other platform", async () => {
      const profile = {
        platform: "other" as const,
        profileUrl: "https://example.com/profile",
        handle: "example.com",
      };

      const result = await fetchPlatformProfile(profile);
      expect(result).toBeDefined();
      expect(result?.platform).toBe("other");
    });
  });

  describe("extractProfileFromPost edge cases", () => {
    test("handles bsky with different path formats", () => {
      const result1 = extractProfileFromPost("https://bsky.app/profile/test.bsky.social/post/abc123");
      expect(result1?.platform).toBe("bluesky");
      expect(result1?.handle).toBe("test.bsky.social");

      const result2 = extractProfileFromPost("https://bsky.app/profile/did:plc:1234567890abcdef/post/abc");
      expect(result2?.platform).toBe("bluesky");
      expect(result2?.handle).toBe("did:plc:1234567890abcdef");
    });

    test("handles twitter with status URLs", () => {
      const result = extractProfileFromPost("https://twitter.com/username/status/1234567890");
      expect(result?.platform).toBe("twitter");
      expect(result?.handle).toBe("@username");
    });

    test("handles x.com URLs", () => {
      const result = extractProfileFromPost("https://x.com/username");
      expect(result?.platform).toBe("twitter");
      expect(result?.handle).toBe("@username");
    });

    test("handles mastodon with users path", () => {
      const result = extractProfileFromPost("https://fosstodon.org/users/testuser/statuses/123");
      expect(result?.platform).toBe("other");
    });

    test("handles threads with query params", () => {
      const result = extractProfileFromPost("https://threads.net/@username?igshid=abc123");
      expect(result?.platform).toBe("threads");
      expect(result?.handle).toBe("username");
    });

    test("handles threads with trailing slash", () => {
      const result = extractProfileFromPost("https://threads.net/@username/");
      expect(result?.platform).toBe("threads");
    });

    test("handles instagram reels and stories as other", () => {
      const result1 = extractProfileFromPost("https://instagram.com/p/ABC123");
      expect(result1?.platform).toBe("other");

      const result2 = extractProfileFromPost("https://instagram.com/reels/ABC123");
      expect(result2?.platform).toBe("other");

      const result3 = extractProfileFromPost("https://instagram.com/stories/username/123");
      expect(result3?.platform).toBe("other");
    });

    test("handles linkedin company URLs", () => {
      const result = extractProfileFromPost("https://linkedin.com/company/acme-corp");
      expect(result?.platform).toBe("linkedin");
      expect(result?.handle).toBe("acme-corp");
    });

    test("handles www prefix", () => {
      const result = extractProfileFromPost("https://www.twitter.com/username");
      expect(result?.platform).toBe("twitter");
    });

    test("returns indieweb for unknown platforms", () => {
      const result = extractProfileFromPost("https://mysite.com/user/profile");
      expect(result?.platform).toBe("indieweb");
      expect(result?.profileUrl).toBe("https://mysite.com/user/profile");
    });
  });
});