export type SocialPlatform = "bluesky" | "twitter" | "unknown";

export interface PlatformProfile {
  platform: SocialPlatform;
  profileUrl: string;
  handle: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
}

export function extractProfileFromPost(postUrl: string): PlatformProfile | null {
  try {
    const url = new URL(postUrl);
    const hostname = url.hostname;

    if (hostname.includes("bsky.app")) {
      const parts = url.pathname.split("/");
      if (parts.length >= 3 && parts[1] === "profile") {
        const handle = parts[2];
        return {
          platform: "bluesky",
          profileUrl: `https://bsky.app/profile/${handle}`,
          handle,
        };
      }
    }

    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      const parts = url.pathname.split("/");
      if (parts.length >= 2) {
        const handle = parts[1];
        return {
          platform: "twitter",
          profileUrl: `https://x.com/${handle}`,
          handle: `@${handle}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchPlatformProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  if (profile.platform === "bluesky") {
    return fetchBlueskyProfile(profile);
  }
  // Twitter/X - just return what we have (no easy public API for bio/avatar)
  return profile;
}

async function fetchBlueskyProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const actor = profile.handle.replace(/^@/, "");
    const res = await fetch(
      `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
    );
    if (!res.ok) return profile;
    const data = await res.json();
    return {
      ...profile,
      displayName: data.displayName || profile.handle,
      bio: data.description || "",
      avatar: data.avatar || "",
      followersCount: data.followersCount || 0,
      followingCount: data.followsCount || 0,
      postsCount: data.postsCount || 0,
    };
  } catch {
    return profile;
  }
}
