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

const PORT = parseInt(process.env.PORT || "3000");

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers for API
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Authenticate agent if Bearer token present
  const agentCtx = await authenticateAgent(req);

  // Check rate limit
  const rateLimitResponse = rateLimitMiddleware(req, agentCtx?.agent_id);
  if (rateLimitResponse) {
    return addCorsHeaders(rateLimitResponse, corsHeaders);
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
    } else if (path.startsWith("/api/")) {
      response = new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Serve static files from public directory
      const filePath = path === "/" ? "/index.html" : path;
      const file = Bun.file(`./public${filePath}`);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    }
  } catch (error) {
    console.error("Request error:", error);
    response = new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return addCorsHeaders(response, corsHeaders);
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

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`🛒 bargn.monster running on http://localhost:${server.port}`);

export { handleRequest };
