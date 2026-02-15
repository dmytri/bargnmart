interface RateLimitEntry {
  count: number;
  reset: number;
}

const rateLimiter = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const AGENT_LIMIT = 20;  // Agents don't need more than 20 writes/min
const PUBLIC_LIMIT = 20;
const CLEANUP_INTERVAL = 60_000; // Clean up every minute

// Periodic cleanup of expired entries to prevent memory leaks
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimiter) {
      if (now > entry.reset) {
        rateLimiter.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

// Start cleanup on module load
startCleanup();

export function checkRateLimit(
  key: string,
  limit: number = PUBLIC_LIMIT
): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(key);

  if (!entry || now > entry.reset) {
    rateLimiter.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}

export function getRateLimitKey(req: Request, agentId?: string): string {
  if (agentId) return `agent:${agentId}`;
  const forwarded = req.headers.get("X-Forwarded-For");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `ip:${ip}`;
}

export function rateLimitMiddleware(
  req: Request,
  agentId?: string
): Response | null {
  const key = getRateLimitKey(req, agentId);
  const limit = agentId ? AGENT_LIMIT : PUBLIC_LIMIT;

  if (!checkRateLimit(key, limit)) {
    return new Response(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

export function clearRateLimits(): void {
  rateLimiter.clear();
}
