import { authenticateAgent, authenticateAdmin } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/ratelimit";
import { handleLeads } from "./routes/leads";
import { handleRequests } from "./routes/requests";
import { handleProducts } from "./routes/products";
import { handlePitches } from "./routes/pitches";
import { handleAgents } from "./routes/agents";
import { handleReputation } from "./routes/reputation";
import { handleModeration } from "./routes/moderation";
import { handleFeed } from "./routes/feed";
import { handleAuth } from "./routes/auth";
import { handleMessages } from "./routes/messages";

const PORT = parseInt(process.env.PORT || "3000");
const MAX_BODY_SIZE = 64 * 1024; // 64KB
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Security headers
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; img-src 'self' data: https:; connect-src 'self'",
};

// Content types for static files
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// Cache durations (in seconds)
const CACHE_DURATIONS = {
  html: 60,              // 1 minute - pages can update
  assets: 31536000,      // 1 year - immutable assets (fonts, images)
  markdown: 300,         // 5 minutes - skill.md etc
  default: 3600,         // 1 hour
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function getCacheControl(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  
  if (ext === ".html") {
    return `public, max-age=${CACHE_DURATIONS.html}, must-revalidate`;
  }
  if (ext === ".md") {
    return `public, max-age=${CACHE_DURATIONS.markdown}, must-revalidate`;
  }
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2"].includes(ext)) {
    return `public, max-age=${CACHE_DURATIONS.assets}, immutable`;
  }
  return `public, max-age=${CACHE_DURATIONS.default}`;
}

async function generateETag(file: ReturnType<typeof Bun.file>): Promise<string> {
  const stat = await file.stat();
  // ETag based on size and mtime
  return `"${stat.size.toString(16)}-${stat.mtime.getTime().toString(16)}"`;
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const requestId = crypto.randomUUID().slice(0, 8); // Short request ID for logging

  // HTTPS enforcement in production
  if (IS_PRODUCTION && req.headers.get("x-forwarded-proto") === "http") {
    return Response.redirect(`https://${req.headers.get("host")}${path}${url.search}`, 301);
  }

  // Request body size limit for POST/PUT/PATCH
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentLength = parseInt(req.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_SIZE) {
      console.log(`[${requestId}] 413 Body too large: ${contentLength} bytes`);
      return addSecurityHeaders(new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }));
    }
  }

  // CORS headers for API
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return addSecurityHeaders(new Response(null, { status: 204, headers: corsHeaders }));
  }

  // Authenticate agent if Bearer token present
  const agentCtx = await authenticateAgent(req);

  // Check rate limit
  const rateLimitResponse = rateLimitMiddleware(req, agentCtx?.agent_id);
  if (rateLimitResponse) {
    console.log(`[${requestId}] 429 Rate limited: ${path}`);
    return addSecurityHeaders(addCorsHeaders(rateLimitResponse, corsHeaders));
  }

  let response: Response;

  try {
    // Route to appropriate handler
    if (path.startsWith("/api/auth")) {
      const subPath = path.replace("/api/auth/", "").replace("/api/auth", "");
      response = await handleAuth(req, subPath);
    } else if (path === "/api/leads" || path === "/api/leads/") {
      response = await handleLeads(req);
    } else if (path.startsWith("/api/requests")) {
      const subPath = path.replace("/api/requests", "").replace(/^\//, "");
      response = await handleRequests(req, subPath, agentCtx);
    } else if (path.startsWith("/api/products")) {
      const subPath = path.replace("/api/products", "").replace(/^\//, "");
      response = await handleProducts(req, subPath, agentCtx);
    } else if (path.startsWith("/api/pitches")) {
      const subPath = path.replace("/api/pitches", "").replace(/^\//, "");
      response = await handlePitches(req, subPath, agentCtx);
    } else if (path.startsWith("/api/agents")) {
      const subPath = path.replace("/api/agents", "").replace(/^\//, "");
      response = await handleAgents(req, subPath);
    } else if (path.startsWith("/api/ratings") || path.startsWith("/api/reputation")) {
      const subPath = path.replace(/^\/api\/(ratings|reputation)/, "").replace(/^\//, "");
      response = await handleReputation(req, subPath, agentCtx);
    } else if (path.startsWith("/api/mod")) {
      const adminCtx = authenticateAdmin(req);
      const subPath = path.replace("/api/mod", "").replace(/^\//, "");
      response = await handleModeration(req, subPath, adminCtx);
    } else if (path === "/api/feed" || path === "/api/feed/") {
      response = await handleFeed(req);
    } else if (path.startsWith("/api/messages")) {
      const subPath = path.replace("/api/messages", "").replace(/^\//, "");
      response = await handleMessages(req, subPath, agentCtx);
    } else if (path.startsWith("/api/")) {
      response = new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Serve static files from public directory with caching
      const filePath = path === "/" ? "/index.html" : path;
      const file = Bun.file(`./public${filePath}`);
      
      if (await file.exists()) {
        const etag = await generateETag(file);
        const ifNoneMatch = req.headers.get("If-None-Match");
        
        // Return 304 Not Modified if ETag matches
        if (ifNoneMatch && ifNoneMatch === etag) {
          return addSecurityHeaders(new Response(null, {
            status: 304,
            headers: {
              "ETag": etag,
              "Cache-Control": getCacheControl(filePath),
            },
          }));
        }
        
        // Return full response with caching headers
        return addSecurityHeaders(new Response(file, {
          headers: {
            "Content-Type": getContentType(filePath),
            "Cache-Control": getCacheControl(filePath),
            "ETag": etag,
            "Vary": "Accept-Encoding",
          },
        }));
      }
      return addSecurityHeaders(new Response("Not found", { status: 404 }));
    }
  } catch (error) {
    // Log full error internally, return generic message to client
    console.error(`[${requestId}] Internal error on ${path}:`, error);
    response = new Response(JSON.stringify({ error: "Internal server error", request_id: requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return addSecurityHeaders(addCorsHeaders(response, corsHeaders));
}

function addCorsHeaders(
  response: Response,
  corsHeaders: Record<string, string>
): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function addSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`🛒 bargn.monster running on http://localhost:${server.port}`);

export { handleRequest };
