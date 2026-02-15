export type SocialPlatform = "bluesky" | "mastodon" | "twitter" | "threads" | "instagram" | "linkedin" | "other";

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
    const hostname = url.hostname.replace(/^www\./, "");
    const path = url.pathname;

    // Bluesky: bsky.app/profile/handle
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

    // Mastodon: any instance/@handle (also matches Threads but Threads uses different path)
    // Threads: threads.net/@username or threads.com/@username
    if (hostname.includes("threads.net") || hostname.includes("threads.com")) {
      const match = path.match(/^\/@([^\/\?]+)/);
      if (match) {
        return {
          platform: "threads",
          profileUrl: postUrl.split("?")[0].replace(/\/$/, ""),
          handle: match[1],
        };
      }
      // Also try /username format
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 1) {
        return {
          platform: "threads",
          profileUrl: postUrl.split("?")[0].replace(/\/$/, ""),
          handle: parts[0],
        };
      }
    }

    // Instagram: instagram.com/username
    if (hostname.includes("instagram.com")) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 1 && parts[0] !== "p" && parts[0] !== "reels") {
        return {
          platform: "instagram",
          profileUrl: `https://instagram.com/${parts[0]}`,
          handle: parts[0],
        };
      }
    }

    // Twitter/X: x.com/handle
    if (hostname.includes("x.com") || hostname.includes("twitter.com")) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 1) {
        return {
          platform: "twitter",
          profileUrl: `https://x.com/${parts[0]}`,
          handle: `@${parts[0]}`,
        };
      }
    }

    // Mastodon: /@handle pattern (works on any Mastodon instance)
    const mastodonMatch = path.match(/^\/@([^\/\?]+)/);
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
      const linkedinMatch = path.match(/^\/in\/([^\/\?]+)/);
      if (linkedinMatch) {
        return {
          platform: "linkedin",
          profileUrl: `https://linkedin.com/in/${linkedinMatch[1]}`,
          handle: linkedinMatch[1],
        };
      }
      const companyMatch = path.match(/^\/company\/([^\/\?]+)/);
      if (companyMatch) {
        return {
          platform: "linkedin",
          profileUrl: `https://linkedin.com/company/${companyMatch[1]}`,
          handle: companyMatch[1],
        };
      }
    }

    // Fallback: anything else - just use the full URL
    return {
      platform: "other",
      profileUrl: postUrl,
      handle: hostname,
    };
  } catch {
    return null;
  }
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
  // Scrape profile pages for other platforms
  if (profile.platform === "twitter") {
    return scrapeTwitterProfile(profile);
  }
  if (profile.platform === "threads") {
    return scrapeThreadsProfile(profile);
  }
  if (profile.platform === "instagram") {
    return scrapeInstagramProfile(profile);
  }
  if (profile.platform === "linkedin") {
    return scrapeLinkedInProfile(profile);
  }
  if (profile.platform === "other") {
    return scrapeGenericProfile(profile);
  }
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

async function scrapeTwitterProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const res = await fetch(profile.profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0)" }
    });
    if (!res.ok) return profile;
    const html = await res.text();
    
    // Extract name from og:title or data-testid
    const nameMatch = html.match(/<meta name="twitter:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta name="twitter:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/);
    
    return {
      ...profile,
      displayName: nameMatch?.[1] || profile.handle.replace("@", ""),
      bio: descMatch?.[1]?.substring(0, 280) || "",
      avatar: imageMatch?.[1] || "",
    };
  } catch {
    return profile;
  }
}

async function scrapeThreadsProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const res = await fetch(profile.profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0)" }
    });
    if (!res.ok) return profile;
    const html = await res.text();
    
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    
    return {
      ...profile,
      displayName: nameMatch?.[1] || profile.handle,
      bio: descMatch?.[1]?.substring(0, 280) || "",
      avatar: imageMatch?.[1] || "",
    };
  } catch {
    return profile;
  }
}

async function scrapeInstagramProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const res = await fetch(profile.profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0)" }
    });
    if (!res.ok) return profile;
    const html = await res.text();
    
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    
    return {
      ...profile,
      displayName: nameMatch?.[1] || profile.handle,
      bio: descMatch?.[1]?.substring(0, 280) || "",
      avatar: imageMatch?.[1] || "",
    };
  } catch {
    return profile;
  }
}

async function scrapeLinkedInProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const res = await fetch(profile.profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0)" }
    });
    if (!res.ok) return profile;
    const html = await res.text();
    
    const nameMatch = html.match(/<meta name="title" content="([^"]+)"/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    
    return {
      ...profile,
      displayName: nameMatch?.[1]?.replace(" | LinkedIn", "") || profile.handle,
      bio: descMatch?.[1]?.substring(0, 280) || "",
      avatar: imageMatch?.[1] || "",
    };
  } catch {
    return profile;
  }
}

async function scrapeGenericProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const res = await fetch(profile.profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0)" }
    });
    if (!res.ok) return profile;
    const html = await res.text();
    
    // Try standard og:meta tags first
    let displayName = "";
    let bio = "";
    let avatar = "";
    
    const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
    const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/);
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
    
    if (ogTitle) displayName = ogTitle[1];
    if (ogDesc) bio = ogDesc[1];
    if (ogImage) avatar = ogImage[1];
    
    // Try indieweb/h-card (common for personal sites)
    if (!displayName) {
      const hCardName = html.match(/<span class="p-name"[^>]*>([^<]+)<\/span>/i);
      if (hCardName) displayName = hCardName[1].trim();
    }
    if (!avatar) {
      const hCardPhoto = html.match(/<img[^>]+class="[^"]*u-photo[^"]*"[^>]+src="([^"]+)"/i);
      if (hCardPhoto) avatar = hCardPhoto[1];
    }
    
    // Try author/meta tags
    if (!displayName) {
      const author = html.match(/<meta name="author" content="([^"]+)"/);
      if (author) displayName = author[1];
    }
    if (!bio) {
      const description = html.match(/<meta name="description" content="([^"]+)"/);
      if (description) bio = description[1];
    }
    if (!avatar) {
      const twitterImage = html.match(/<meta name="twitter:image" content="([^"]+)"/);
      if (twitterImage) avatar = twitterImage[1];
    }
    
    // Only return if we found something useful
    if (displayName || avatar) {
      return {
        ...profile,
        displayName: displayName || profile.handle,
        bio: bio?.substring(0, 280) || "",
        avatar,
      };
    }
    
    return profile;
  } catch {
    return profile;
  }
}
