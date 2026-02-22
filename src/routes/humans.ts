import { getDb } from "../db/client";
import { authenticateHuman } from "../middleware/auth";
import { isValidUrl } from "../middleware/validation";
import { extractProfileFromPost, fetchPlatformProfile } from "../lib/social";
import { postActivation } from "../lib/social-poster";

export async function handleHumans(
  req: Request,
  path: string
): Promise<Response> {
  // GET /api/humans/:id - public profile
  if (req.method === "GET") {
    const match = path.match(/^([a-f0-9-]{36})$/);
    if (match) {
      return getHumanProfile(match[1]);
    }
    return json({ error: "Not found" }, 404);
  }

  // POST /api/humans/:id/claim - claim with social proof
  if (req.method === "POST") {
    const claimMatch = path.match(/^([a-f0-9-]{36})\/claim$/);
    if (claimMatch) {
      return claimHuman(req, claimMatch[1]);
    }
    return json({ error: "Not found" }, 404);
  }

  return json({ error: "Method not allowed" }, 405);
}

// GET /api/humans/:id - public human profile
async function getHumanProfile(humanId: string): Promise<Response> {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT id, display_name, status, claimed_at, claimed_proof_url, created_at FROM humans WHERE id = ?`,
    args: [humanId],
  });

  if (result.rows.length === 0) {
    return json({ error: "Human not found" }, 404);
  }

  const human = result.rows[0];
  const status = human.status as string;

  // Don't expose banned users
  if (status === "banned") {
    return json({ error: "Human not found" }, 404);
  }

  // Get public stats
  const requestCount = await db.execute({
    sql: `SELECT COUNT(*) as count FROM requests WHERE human_id = ? AND status != 'deleted' AND hidden = 0`,
    args: [humanId],
  });

  const response: Record<string, unknown> = {
    id: human.id,
    display_name: human.display_name,
    status: status === "legacy" ? "inactive" : status, // Don't expose 'legacy' to public
    created_at: human.created_at,
    stats: {
      request_count: Number(requestCount.rows[0].count),
    },
  };

  // Include proof URL if claimed (for embed)
  if (human.claimed_at && human.claimed_proof_url) {
    response.claimed_at = human.claimed_at;
    response.claimed_proof_url = human.claimed_proof_url;
    
    const profile = extractProfileFromPost(human.claimed_proof_url as string);
    if (profile) {
      response.claimed_profile_url = profile.profileUrl;
      response.claimed_platform = profile.platform;
      response.claimed_handle = profile.handle;
      
      // Fetch platform profile for nice card
      const fullProfile = await fetchPlatformProfile(profile);
      if (fullProfile.displayName || fullProfile.avatar) {
        response.claimed_display_name = fullProfile.displayName;
        response.claimed_bio = fullProfile.bio;
        response.claimed_avatar = fullProfile.avatar;
        response.claimed_followers = fullProfile.followersCount;
        response.claimed_following = fullProfile.followingCount;
        response.claimed_posts = fullProfile.postsCount;
      }
    }
  }

  return json(response);
}

// POST /api/humans/:id/claim - claim with social proof
async function claimHuman(req: Request, humanId: string): Promise<Response> {
  // Must be authenticated as this human
  const humanCtx = await authenticateHuman(req);
  
  if (!humanCtx) {
    return json({ error: "Unauthorized - login required" }, 401);
  }
  
  if (humanCtx.human_id !== humanId) {
    return json({ error: "You can only claim your own profile" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const { proof_url } = body as { proof_url?: string };

  if (!proof_url) {
    return json({ error: "proof_url is required" }, 400);
  }

  if (!isValidUrl(proof_url)) {
    return json({ error: "proof_url must be a valid HTTPS URL" }, 400);
  }

  // Validate it looks like a social media post OR is an IndieWeb URL
  const validDomains = [
    "twitter.com",
    "x.com",
    "bsky.app",
    "mastodon.social",
    "threads.net",
    "instagram.com",
    "facebook.com",
    "linkedin.com",
  ];
  
  const url = new URL(proof_url);
  const hostname = url.hostname.replace(/^www\./, "");
  
  // Allow any mastodon instance (*.social, *.online, etc)
  const isMastodon = hostname.includes("mastodon") || 
                     url.pathname.includes("/@") ||
                     hostname.endsWith(".social");
  
  // IndieWeb: personal websites (not known platforms)
  const knownPlatforms = ["bsky.app", "twitter.com", "x.com", "threads.net", "threads.com", "instagram.com", "mastodon.social", "mastodon.online", "fosstodon.org", "linkedin.com", "facebook.com"];
  const isIndieweb = !validDomains.includes(hostname) && !isMastodon && !knownPlatforms.some(p => hostname.includes(p));
  
  if (!validDomains.includes(hostname) && !isMastodon && !isIndieweb) {
    return json({ 
      error: "proof_url must be from a supported social platform",
      supported: validDomains,
    }, 400);
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Check current status
  const result = await db.execute({
    sql: `SELECT status, display_name FROM humans WHERE id = ?`,
    args: [humanId],
  });

  if (result.rows.length === 0) {
    return json({ error: "Human not found" }, 404);
  }

  const status = result.rows[0].status as string;
  const displayName = result.rows[0].display_name as string;

  if (status === "active") {
    return json({ error: "Already claimed" }, 409);
  }

  if (status === "banned") {
    return json({ error: "Account has been banned" }, 403);
  }

  if (status === "suspended") {
    return json({ error: "Account is suspended" }, 403);
  }

  // For IndieWeb URLs, verify rel="me" or rel="author" link exists
  if (isIndieweb) {
    // Fetch the claimed website and check for rel="me" or rel="author" link to this user
    const userProfileUrl = `https://bargn.monster/user/${humanId}`;
    
    try {
      const fetchResponse = await fetch(proof_url, {
        headers: { "User-Agent": "bargn-monster/1.0" },
      });
      
      if (!fetchResponse.ok) {
        return json({ error: "Could not verify your website. Make sure it's accessible." }, 400);
      }
      
      const html = await fetchResponse.text();
      
      // Look for <a rel="me" href="bargn.monster/user/..."> or <a rel="author" href="...">
      const relMeMatch = html.match(/<a[^>]+(?:rel=["']me["']|rel=["']author["'])[^>]+href=["']([^'"]*bargn\.monster[^"']*)["']/i) ||
                        html.match(/<a[^>]+href=["']([^"]*bargn\.monster[^"]*)["'][^>]+(?:rel=["']me["']|rel=["']author["'])/i);
      
      if (!relMeMatch) {
        return json({ 
          error: "Your website must include a link to this profile with rel=\"me\" or rel=\"author\" (e.g., <a rel=\"me\" href=\"https://bargn.monster/user/...\">)"
        }, 400);
      }
    } catch {
      return json({ error: "Could not verify your website. Make sure it's accessible." }, 400);
    }
  }

  // Activate the account
  await db.execute({
    sql: `UPDATE humans SET status = 'active', claimed_at = ?, claimed_proof_url = ? WHERE id = ?`,
    args: [now, proof_url, humanId],
  });

  // Post to social platform (fire-and-forget)
  postActivation(proof_url, displayName, `/user/${humanId}`).catch(() => {});

  return json({
    status: "active",
    claimed_at: now,
    claimed_proof_url: proof_url,
    message: "Account activated! You can now post requests.",
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, (_key, value) => {
    if (typeof value === "bigint") {
      if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(value);
      }
      return value.toString();
    }
    return value;
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
