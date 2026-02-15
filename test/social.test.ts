import { describe, test, expect } from "bun:test";
import { extractProfileFromPost } from "../src/lib/social";

describe("extractProfileFromPost", () => {
  test("extracts Bluesky profile", () => {
    const result = extractProfileFromPost("https://bsky.app/profile/mochka.cc/post/3mehmuhf2us2m");
    expect(result?.platform).toBe("bluesky");
    expect(result?.handle).toBe("mochka.cc");
    expect(result?.profileUrl).toBe("https://bsky.app/profile/mochka.cc");
  });

  test("extracts Bluesky profile with DID", () => {
    const result = extractProfileFromPost("https://bsky.app/profile/did:plc:2iuump5rcgdlwj6dhf2cxnlt/post/abc");
    expect(result?.platform).toBe("bluesky");
    expect(result?.handle).toBe("did:plc:2iuump5rcgdlwj6dhf2cxnlt");
  });

  test("extracts Twitter/X profile", () => {
    const result = extractProfileFromPost("https://x.com/dmytri/status/1234567890");
    expect(result?.platform).toBe("twitter");
    expect(result?.handle).toBe("@dmytri");
    expect(result?.profileUrl).toBe("https://x.com/dmytri");
  });

  test("extracts Twitter/X from twitter.com", () => {
    const result = extractProfileFromPost("https://twitter.com/dmytri/status/1234567890");
    expect(result?.platform).toBe("twitter");
    expect(result?.handle).toBe("@dmytri");
  });

  test("extracts Mastodon profile", () => {
    const result = extractProfileFromPost("https://fosstodon.org/@dmytrimek/status/1234567890");
    expect(result?.platform).toBe("mastodon");
    expect(result?.handle).toBe("@dmytrimek@fosstodon.org");
    expect(result?.profileUrl).toBe("https://fosstodon.org/@dmytrimek");
  });

  test("extracts Threads profile", () => {
    const result = extractProfileFromPost("https://threads.net/@dmytrimek/post/abc123");
    expect(result?.platform).toBe("threads");
    expect(result?.handle).toBe("dmytrimek");
  });

  test("extracts Threads from threads.com", () => {
    const result = extractProfileFromPost("https://threads.com/@dmytrimek/abc");
    expect(result?.platform).toBe("threads");
  });

  test("extracts Instagram profile", () => {
    const result = extractProfileFromPost("https://instagram.com/dmytrimek/p/ABC123");
    expect(result?.platform).toBe("instagram");
    expect(result?.handle).toBe("dmytrimek");
    expect(result?.profileUrl).toBe("https://instagram.com/dmytrimek");
  });

  test("extracts LinkedIn profile", () => {
    const result = extractProfileFromPost("https://linkedin.com/in/dmytri-krasinsky-123456");
    expect(result?.platform).toBe("linkedin");
    expect(result?.handle).toBe("dmytri-krasinsky-123456");
    expect(result?.profileUrl).toBe("https://linkedin.com/in/dmytri-krasinsky-123456");
  });

  test("extracts LinkedIn company", () => {
    const result = extractProfileFromPost("https://linkedin.com/company/bargn-monster");
    expect(result?.platform).toBe("linkedin");
    expect(result?.handle).toBe("bargn-monster");
  });

  test("returns other for unknown platforms", () => {
    const result = extractProfileFromPost("https://dmytr.me/about");
    expect(result?.platform).toBe("other");
    expect(result?.handle).toBe("dmytr.me");
    expect(result?.profileUrl).toBe("https://dmytr.me/about");
  });

  test("handles invalid URL", () => {
    const result = extractProfileFromPost("not-a-url");
    expect(result).toBeNull();
  });
});
