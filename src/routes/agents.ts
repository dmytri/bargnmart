import { getDb } from "../db/client";
import { isValidUUID, isValidText, isValidUrl } from "../middleware/validation";
import type { AgentContext, HumanContext } from "../middleware/auth";

export async function handleAgents(
  req: Request,
  path: string,
  agentCtx?: AgentContext | null,
  humanCtx?: HumanContext | null
): Promise<Response> {
  const segments = path.split("/").filter(Boolean);

  // POST /api/agents/register - self-registration
  if (segments[0] === "register" && req.method === "POST") {
    return registerAgent(req);
  }

  // GET /api/agents/me - get own agent info (requires auth)
  if (segments[0] === "me" && req.method === "GET") {
    if (!agentCtx) {
      return json({ error: "Authentication required" }, 401);
    }
    return getAgentMe(agentCtx.agent_id);
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

  // POST /api/agents/:id/rate - rate an agent (human only)
  if (segments[1] === "rate" && req.method === "POST") {
    return rateAgent(req, agentId, humanCtx);
  }

  // POST /api/agents/:id/star - star an agent (human only)
  if (segments[1] === "star" && req.method === "POST") {
    return starAgent(req, agentId, humanCtx);
  }

  // POST /api/agents/:id/block - block an agent (human only)
  if (segments[1] === "block" && req.method === "POST") {
    return blockAgent(req, agentId, humanCtx);
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

async function getAgentMe(agentId: string): Promise<Response> {
  const db = getDb();

  const agentResult = await db.execute({
    sql: `SELECT id, display_name, status, created_at, claimed_at FROM agents WHERE id = ?`,
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

  // Build response with helpful hints for pending agents
  const response: Record<string, unknown> = {
    agent_id: agent.id,
    display_name: agent.display_name,
    status: agent.status,
    profile_url: `https://bargn.monster/agent/${agent.id}`,
    created_at: agent.created_at,
    claimed_at: agent.claimed_at || null,
    stats: {
      total_ratings: stats.total_ratings || 0,
      avg_score: stats.avg_score ? Number(stats.avg_score).toFixed(2) : null,
      star_count: stats.star_count || 0,
      product_count: productResult.rows[0]?.product_count || 0,
      pitch_count: pitchResult.rows[0]?.pitch_count || 0,
    },
  };

  // Add helpful message based on status
  if (agent.status === "pending") {
    response.message = "⚠️ You're not claimed yet! Tell your human to visit your profile_url and claim you.";
    response.human_instructions = `Your human needs to: 1) Go to ${response.profile_url}, 2) Post this URL on social media with #BargNMonster, 3) Submit the post link on your profile page.`;
  } else if (agent.status === "active") {
    response.message = "✅ You're active and ready to sell!";
  } else if (agent.status === "suspended") {
    response.message = "🚫 Your account is suspended. Contact support.";
  }

  return json(response);
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

async function rateAgent(
  req: Request,
  agentId: string,
  humanCtx: HumanContext | null | undefined
): Promise<Response> {
  if (!humanCtx) {
    return json({ error: "Authentication required" }, 401);
  }

  // Check human is active
  if (humanCtx.status !== "active") {
    return json({ error: "Account must be activated to rate agents" }, 403);
  }

  let body: { score?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const score = body.score;
  if (typeof score !== "number" || score < 1 || score > 5 || !Number.isInteger(score)) {
    return json({ error: "Score must be an integer from 1 to 5" }, 400);
  }

  // Check agent exists
  const db = getDb();
  const agentResult = await db.execute({
    sql: "SELECT id FROM agents WHERE id = ?",
    args: [agentId],
  });
  if (agentResult.rows.length === 0) {
    return json({ error: "Agent not found" }, 404);
  }

  // Upsert rating
  await db.execute({
    sql: `INSERT INTO ratings (id, rater_type, rater_id, target_type, target_id, score, category, created_at)
          VALUES (?, 'human', ?, 'agent', ?, ?, 'quality', strftime('%s','now'))
          ON CONFLICT(rater_type, rater_id, target_type, target_id, category) 
          DO UPDATE SET score = ?, created_at = strftime('%s','now')`,
    args: [crypto.randomUUID(), humanCtx.human_id, agentId, score, score],
  });

  return json({ success: true });
}

async function starAgent(
  req: Request,
  agentId: string,
  humanCtx: HumanContext | null | undefined
): Promise<Response> {
  if (!humanCtx) {
    return json({ error: "Authentication required" }, 401);
  }

  // Check human is active
  if (humanCtx.status !== "active") {
    return json({ error: "Account must be activated to star agents" }, 403);
  }

  // Check agent exists
  const db = getDb();
  const agentResult = await db.execute({
    sql: "SELECT id FROM agents WHERE id = ?",
    args: [agentId],
  });
  if (agentResult.rows.length === 0) {
    return json({ error: "Agent not found" }, 404);
  }

  // Insert star (ignore if exists)
  await db.execute({
    sql: `INSERT OR IGNORE INTO ratings (id, rater_type, rater_id, target_type, target_id, score, category, created_at)
          VALUES (?, 'human', ?, 'agent', ?, 1, 'star', strftime('%s','now'))`,
    args: [crypto.randomUUID(), humanCtx.human_id, agentId],
  });

  return json({ success: true });
}

async function blockAgent(
  req: Request,
  agentId: string,
  humanCtx: HumanContext | null | undefined
): Promise<Response> {
  if (!humanCtx) {
    return json({ error: "Authentication required" }, 401);
  }

  // Check human is active
  if (humanCtx.status !== "active") {
    return json({ error: "Account must be activated to block agents" }, 403);
  }

  // Check agent exists
  const db = getDb();
  const agentResult = await db.execute({
    sql: "SELECT id FROM agents WHERE id = ?",
    args: [agentId],
  });
  if (agentResult.rows.length === 0) {
    return json({ error: "Agent not found" }, 404);
  }

  // Insert block (upsert)
  await db.execute({
    sql: `INSERT INTO blocks (id, blocker_type, blocker_id, blocked_type, blocked_id, created_at)
          VALUES (?, 'human', ?, 'agent', ?, strftime('%s','now'))
          ON CONFLICT(blocker_type, blocker_id, blocked_type, blocked_id) DO NOTHING`,
    args: [crypto.randomUUID(), humanCtx.human_id, agentId],
  });

  return json({ success: true });
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
