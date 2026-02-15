import { describe, expect, test, beforeEach } from "bun:test";
import { isBlueskyConfigured, postToBluesky, postRequestToBluesky, postProductToBluesky } from "../src/lib/bluesky";

describe("bluesky", () => {
  beforeEach(() => {
    process.env.BLUESKY_HANDLE = undefined;
    process.env.BLUESKY_APP_PASSWORD = undefined;
  });

  test("isBlueskyConfigured returns false when env vars not set", () => {
    expect(isBlueskyConfigured()).toBe(false);
  });

  test("isBlueskyConfigured returns true when both env vars set", () => {
    process.env.BLUESKY_HANDLE = "test.bsky.social";
    process.env.BLUESKY_APP_PASSWORD = "test-password";
    expect(isBlueskyConfigured()).toBe(true);
  });

  test("isBlueskyConfigured returns false when only handle set", () => {
    process.env.BLUESKY_HANDLE = "test.bsky.social";
    expect(isBlueskyConfigured()).toBe(false);
  });

  test("isBlueskyConfigured returns false when only password set", () => {
    process.env.BLUESKY_APP_PASSWORD = "test-password";
    expect(isBlueskyConfigured()).toBe(false);
  });

  test("postToBluesky returns false when not configured", async () => {
    const result = await postToBluesky("test message");
    expect(result).toBe(false);
  });

  test("postRequestToBluesky returns false when not configured", async () => {
    const result = await postRequestToBluesky("test request", 1000, 5000, "test-id");
    expect(result).toBe(false);
  });

  test("postProductToBluesky returns false when not configured", async () => {
    const result = await postProductToBluesky("test product", 1999, "test-id");
    expect(result).toBe(false);
  });
});
