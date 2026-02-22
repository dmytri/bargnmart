export type SocialPlatform = "bluesky" | "mastodon" | "twitter" | "threads" | "instagram" | "linkedin" | "indieweb" | "other";

// Strip HTML tags from text - converts <p> to newlines, removes all tags
// Then uses escapeHtml as defense-in-depth for any missed tags
import { escapeHtml } from "bun";

function stripHtml(html: string): string {
  return escapeHtml(
    html
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<p\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim()
  );
}

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

    // Bluesky: bsky.app/profile/handle or bsky.app/profile/did:plc:xxx
    if (hostname.includes("bsky.app")) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0] === "profile") {
        const handle = parts[1];
        return {
          platform: "bluesky",
          profileUrl: `https://bsky.app/profile/${handle}`,
          handle,
        };
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
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 1) {
        return {
          platform: "threads",
          profileUrl: postUrl.split("?")[0].replace(/\/$/, ""),
          handle: parts[0],
        };
      }
    }

    // Instagram: instagram.com/username (but not /p/ or /reels/)
    if (hostname.includes("instagram.com")) {
      const match = path.match(/^\/([^\/\?]+)/);
      if (match && match[1] !== "p" && match[1] !== "reels" && match[1] !== "stories") {
        return {
          platform: "instagram",
          profileUrl: `https://instagram.com/${match[1]}`,
          handle: match[1],
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

    // IndieWeb: any website that's not a known social platform
    // We treat personal websites as indieweb (they'll have h-card)
    const knownPlatforms = ["bsky.app", "twitter.com", "x.com", "threads.net", "threads.com", "instagram.com", "mastodon.social", "mastodon.online", "fosstodon.org", "linkedin.com"];
    const isKnownPlatform = knownPlatforms.some(p => hostname.includes(p)) || path.startsWith("/@");
    
    if (!isKnownPlatform) {
      return {
        platform: "indieweb",
        profileUrl: postUrl,
        handle: hostname,
      };
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
  if (profile.platform === "indieweb") {
    return scrapeIndiewebProfile(profile);
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
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
    );
    if (!res.ok) return profile;
    const data = await res.json() as Record<string, unknown>;
    return {
      ...profile,
      displayName: (data.displayName as string) || profile.handle,
      bio: stripHtml((data.description as string) || ""),
      avatar: (data.avatar as string) || "",
      followersCount: (data.followersCount as number) || 0,
      followingCount: (data.followsCount as number) || 0,
      postsCount: (data.postsCount as number) || 0,
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
    const data = await res.json() as Record<string, unknown>;
    return {
      ...profile,
      displayName: (data.display_name as string) || username,
      bio: stripHtml((data.note as string) || ""),
      avatar: (data.avatar as string) || "",
      followersCount: (data.followers_count as number) || 0,
      followingCount: (data.following_count as number) || 0,
      postsCount: (data.statuses_count as number) || 0,
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
    
    // Threads uses JSON-LD or meta tags
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

// IndieWeb profile scraping - prioritizes h-card microformat
async function scrapeIndiewebProfile(profile: PlatformProfile): Promise<PlatformProfile | null> {
  try {
    const res = await fetch(profile.profileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0)" }
    });
    if (!res.ok) return profile;
    const html = await res.text();
    
    // Try indieweb h-card first (prioritized for indieweb)
    let displayName = "";
    let bio = "";
    let avatar = "";
    
    // p-name for display name
    const hCardName = html.match(/<span class=[\"']?p-name[\"']?[^>]*>([^<]+)<\/span>/i) ||
                      html.match(/<span class=[\"']?h-card[\"'][^>]*>\s*<span[^>]*class=[\"']?p-name[\"']?[^>]*>([^<]+)</i);
    if (hCardName) displayName = hCardName[1].trim();
    
    // p-note for bio
    const hCardBio = html.match(/<span class=[\"']?p-note[\"']?[^>]*>([\s\S]*?)<\/span>/i);
    if (hCardBio) bio = stripHtml(hCardBio[1]).substring(0, 280);
    
    // u-photo for avatar
    const hCardPhoto = html.match(/<img[^>]+class=[\"']?u-photo[\"']?[^>]+src=[\"']([^\"']+)[\"']/i) ||
                       html.match(/<img[^>]+src=[\"']([^\"']+)[\"'][^>]+class=[\"']?u-photo[\"']?/i);
    if (hCardPhoto) avatar = hCardPhoto[1];
    
    // u-url for profile link
    const hCardUrl = html.match(/<a[^>]+class=[\"']?u-url[\"']?[^>]+href=[\"']([^\"']+)[\"']/i);
    const profileUrl = hCardUrl ? hCardUrl[1] : profile.profileUrl;
    
    // Fallback to OG tags if h-card not found
    if (!displayName) {
      const ogTitle = html.match(/<meta property=\"og:title\" content=\"([^\"]+)\"/);
      if (ogTitle) displayName = ogTitle[1];
    }
    if (!avatar) {
      const ogImage = html.match(/<meta property=\"og:image\" content=\"([^\"]+)\"/);
      if (ogImage) avatar = ogImage[1];
    }
    if (!bio) {
      const ogDesc = html.match(/<meta property=\"og:description\" content=\"([^\"]+)\"/);
      if (ogDesc) bio = ogDesc[1].substring(0, 280);
    }
    
    // Only return if we found something useful
    if (displayName || avatar) {
      return {
        ...profile,
        displayName: displayName || profile.handle,
        bio: bio?.substring(0, 280) || "",
        avatar,
        profileUrl, // Use h-card u-url if found
      };
    }
    
    return profile;
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
    
    // Try indieweb h-card (common for personal sites)
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
