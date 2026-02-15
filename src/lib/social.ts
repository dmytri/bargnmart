export type SocialPlatform = "bluesky" | "twitter" | "mastodon" | "linkedin" | "unknown";

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
    const path = url.pathname;

    // Bluesky: bsky.app/profile/handle or bsky.app/profile/did:plc:xxx
    if (hostname.includes("bsky.app")) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0] === "profile") {
        const handle = parts[1];
        if (!handle.includes(":")) { // Skip DID format
          return {
            platform: "bluesky",
            profileUrl: `https://bsky.app/profile/${handle}`,
            handle,
          };
        }
      }
    }

    // Twitter/X: x.com/handle
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 1) {
        const handle = parts[0];
        return {
          platform: "twitter",
          profileUrl: `https://x.com/${handle}`,
          handle: `@${handle}`,
        };
      }
    }

    // Mastodon: instance/@handle or instance/users/handle (post URLs have more segments)
    // Check for /@handle pattern (profile) vs /@handle/123456 (post)
    const mastodonMatch = path.match(/^\/@([^\/]+)/);
    if (mastodonMatch) {
      const handle = mastodonMatch[1];
      return {
        platform: "mastodon",
        profileUrl: `https://${hostname}/@${handle}`,
        handle: `@${handle}@${hostname}`,
      };
    }

    // LinkedIn: linkedin.com/in/username or linkedin.com/company/name
    if (hostname.includes("linkedin.com")) {
      const linkedinMatch = path.match(/^\/in\/([^\/]+)/);
      if (linkedinMatch) {
        const handle = linkedinMatch[1];
        return {
          platform: "linkedin",
          profileUrl: `https://linkedin.com/in/${handle}`,
          handle: handle,
        };
      }
      const companyMatch = path.match(/^\/company\/([^\/]+)/);
      if (companyMatch) {
        const handle = companyMatch[1];
        return {
          platform: "linkedin",
          profileUrl: `https://linkedin.com/company/${handle}`,
          handle: handle,
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
  if (profile.platform === "mastodon") {
    return fetchMastodonProfile(profile);
  }
  // Twitter/X - just return what we have (no easy public API)
  // LinkedIn - requires auth, just return handle
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

async function fetchMastodonProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    // Extract instance from handle like @user@fosstodon.org
    const parts = profile.handle.split("@").filter(Boolean);
    if (parts.length < 2) return profile;
    const instance = parts[1];
    const username = parts[0];
    
    const res = await fetch(
      `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`
    );
    if (!res.ok) return profile;
    const data = await res.json();
    return {
      ...profile,
      displayName: data.display_name || username,
      bio: data.note || "",
      avatar: data.avatar || "",
      followersCount: data.followers_count || 0,
      followingCount: data.following_count || 0,
      postsCount: data.statuses_count || 0,
    };
  } catch {
    return profile;
  }
}
