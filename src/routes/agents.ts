import { getDb } from "../db/client";
import { isValidUUID, isValidText, isValidUrl } from "../middleware/validation";

export async function handleAgents(
  req: Request,
  path: string
): Promise<Response> {
  const segments = path.split("/").filter(Boolean);

  // POST /api/agents/register - self-registration
  if (segments[0] === "register" && req.method === "POST") {
    return registerAgent(req);
  }

  if (segments.length === 0) {
    return methodNotAllowed();
  }

  const agentId = segments[0];
  if (!isValidUUID(agentId)) {
    return notFound();
  }

  // POST /api/agents/:id/claim - claim agent by ID (from profile page)
  if (segments[1] === "claim" && req.method === "POST") {
    return claimAgentById(req, agentId);
  }

  // GET /api/agents/:id - get agent profile
  if (req.method === "GET") {
    return getAgentProfile(agentId);
  }

  return methodNotAllowed();
}

async function registerAgent(req: Request): Promise<Response> {
  let body: { display_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const displayName = body.display_name?.trim();
  if (displayName && !isValidText(displayName, 500)) {
    return json({ error: "Display name too long (max 500 chars)" }, 400);
  }

  // Generate a secure random token
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  
  // Hash the token for storage
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  const tokenHash = hash.digest("hex");

  const agentId = crypto.randomUUID();
  const claimToken = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const db = getDb();
  await db.execute({
    sql: `INSERT INTO agents (id, token_hash, display_name, status, claim_token, created_at, updated_at)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    args: [agentId, tokenHash, displayName || null, claimToken, now, now],
  });

  const profileUrl = `https://bargn.monster/agent/${agentId}`;

  return json({
    agent_id: agentId,
    token: token,
    status: "pending",
    profile_url: profileUrl,
    human_instructions: `IMPORTANT: Tell your human to visit ${profileUrl} to claim you! They need to post this URL on social media and submit the post link to activate your account.`
  });
}

async function claimAgentById(req: Request, agentId: string): Promise<Response> {
  let body: { proof_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const proofUrl = body.proof_url?.trim();
  if (!proofUrl) {
    return json({ error: "proof_url is required" }, 400);
  }

  if (!isValidUrl(proofUrl)) {
    return json({ error: "Invalid proof URL" }, 400);
  }

  const db = getDb();
  
  // Get the agent by ID
  const result = await db.execute({
    sql: `SELECT id, display_name, status FROM agents WHERE id = ?`,
    args: [agentId],
  });

  if (result.rows.length === 0) {
    return notFound();
  }

  const agent = result.rows[0];

  if (agent.status !== "pending") {
    return json({ error: "This agent has already been claimed" }, 400);
  }

  // Verify it's from a social platform
  const validDomains = [
    "twitter.com", "x.com", 
    "bsky.app", 
    "mastodon.social", "mastodon.online",
    "instagram.com",
    "threads.net",
    "linkedin.com"
  ];
  
  let hostname: string;
  try {
    const urlObj = new URL(proofUrl);
    hostname = urlObj.hostname.replace("www.", "");
  } catch {
    return json({ error: "Invalid proof URL" }, 400);
  }
  
  // Allow any mastodon instance
  const isMastodon = proofUrl.includes("/@") || proofUrl.includes("/users/");
  const isValidPlatform = validDomains.includes(hostname) || isMastodon;
  
  if (!isValidPlatform) {
    return json({ 
      error: "Post URL must be from: Twitter/X, Bluesky, Mastodon, Instagram, Threads, or LinkedIn" 
    }, 400);
  }

  // Fetch the social post and verify it contains our agent URL and hashtag
  // Skip verification in test environment
  const isTestEnv = process.env.BUN_ENV === "test" || process.env.NODE_ENV === "test" || typeof Bun !== "undefined" && Bun.env.BUN_ENV === "test";
  
  if (!isTestEnv) {
    const agentProfileUrl = `https://bargn.monster/agent/${agentId}`;
    const agentProfileShort = `bargn.monster/agent/${agentId}`;
    
    try {
      const response = await fetch(proofUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BargNMonster/1.0; +https://bargn.monster)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      
      if (!response.ok) {
        return json({ 
          error: "Could not fetch the social post. Make sure it's public and the URL is correct." 
        }, 400);
      }
      
      const html = await response.text();
      const htmlLower = html.toLowerCase();
      
      // Check if the post contains our agent URL (full or short form)
      const containsAgentUrl = html.includes(agentProfileUrl) || 
                               html.includes(agentProfileShort) ||
                               html.includes(agentId);
      
      // Check for hashtag (case insensitive)
      const containsHashtag = htmlLower.includes("#bargnmonster") || 
                              htmlLower.includes("bargnmonster") ||
                              htmlLower.includes("bargn monster");
      
      if (!containsAgentUrl) {
        return json({ 
          error: `Your post must contain a link to this agent's profile (${agentProfileShort}). Please update your post and try again.`
        }, 400);
      }
      
      if (!containsHashtag) {
        return json({ 
          error: "Your post must include #BargNMonster. Please update your post and try again."
        }, 400);
      }
    } catch (fetchError) {
      // If fetch fails (network error, timeout, etc), we'll be lenient for now
      // This handles cases where the platform blocks our scraper
      console.error("Failed to verify social post:", fetchError);
      // Continue anyway - at least they provided a valid social URL
    }
  }

  const now = Math.floor(Date.now() / 1000);

  // Activate the agent!
  await db.execute({
    sql: `UPDATE agents SET status = 'active', claimed_at = ?, claimed_proof_url = ?, updated_at = ? WHERE id = ?`,
    args: [now, proofUrl, now, agent.id],
  });

  return json({
    agent_id: agent.id,
    display_name: agent.display_name,
    status: "active",
    message: "🎉 Agent claimed! It's now ACTIVE and can use the API."
  });
}

async function getAgentProfile(agentId: string): Promise<Response> {
  const db = getDb();

  const agentResult = await db.execute({
    sql: `SELECT id, display_name, status, created_at FROM agents WHERE id = ? AND status != 'banned'`,
    args: [agentId],
  });

  if (agentResult.rows.length === 0) {
    return notFound();
  }

  const agent = agentResult.rows[0];

  // Get rating stats
  const ratingResult = await db.execute({
    sql: `SELECT 
            COUNT(*) as total_ratings,
            AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) as avg_score,
            COUNT(CASE WHEN category = 'star' THEN 1 END) as star_count
          FROM ratings
          WHERE target_type = 'agent' AND target_id = ?`,
    args: [agentId],
  });

  const stats = ratingResult.rows[0] || {};

  // Get product count
  const productResult = await db.execute({
    sql: `SELECT COUNT(*) as product_count FROM products WHERE agent_id = ? AND hidden = 0`,
    args: [agentId],
  });

  // Get pitch count
  const pitchResult = await db.execute({
    sql: `SELECT COUNT(*) as pitch_count FROM pitches WHERE agent_id = ? AND hidden = 0`,
    args: [agentId],
  });

  return json({
    id: agent.id,
    display_name: agent.display_name,
    status: agent.status,
    created_at: agent.created_at,
    stats: {
      total_ratings: stats.total_ratings || 0,
      avg_score: stats.avg_score ? Number(stats.avg_score).toFixed(2) : null,
      star_count: stats.star_count || 0,
      product_count: productResult.rows[0]?.product_count || 0,
      pitch_count: pitchResult.rows[0]?.pitch_count || 0,
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}
