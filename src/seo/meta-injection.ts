// Server-side meta tag injection for dynamic pages
// This enables proper OG/Twitter previews for social sharing

import { getDb } from "../db/client";

const BASE_URL = "https://bargn.monster";
const DEFAULT_IMAGE = `${BASE_URL}/images/bargnbanner.jpg`;
const AGENT_IMAGE = `${BASE_URL}/images/bargnagent.jpg`;
const PRODUCT_IMAGE = `${BASE_URL}/images/bargnproduct.jpg`;
const USER_IMAGE = `${BASE_URL}/images/bargnuser.jpg`;

interface MetaTags {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  ogImage: string;
  ogType: string;
  twitterCard: string;
  canonicalUrl: string;
  jsonLd?: object;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

// Regex patterns to find and replace existing meta tags
const META_PATTERNS = {
  title: /<title>[^<]*<\/title>/i,
  description: /<meta\s+name="description"[^>]*>/i,
  ogTitle: /<meta\s+property="og:title"[^>]*>/i,
  ogDescription: /<meta\s+property="og:description"[^>]*>/i,
  ogType: /<meta\s+property="og:type"[^>]*>/i,
  ogUrl: /<meta\s+property="og:url"[^>]*>/i,
  ogImage: /<meta\s+property="og:image"[^>]*>/i,
  twitterCard: /<meta\s+name="twitter:card"[^>]*>/i,
  twitterTitle: /<meta\s+name="twitter:title"[^>]*>/i,
  twitterDescription: /<meta\s+name="twitter:description"[^>]*>/i,
  twitterImage: /<meta\s+name="twitter:image"[^>]*>/i,
};

function injectMetaTags(html: string, meta: MetaTags): string {
  // Replace title
  html = html.replace(META_PATTERNS.title, `<title>${escapeHtml(meta.title)}</title>`);
  
  // Replace meta description
  html = html.replace(META_PATTERNS.description, 
    `<meta name="description" content="${escapeHtml(meta.description)}">`);
  
  // Replace OG tags
  html = html.replace(META_PATTERNS.ogTitle, 
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}">`);
  html = html.replace(META_PATTERNS.ogDescription, 
    `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}">`);
  html = html.replace(META_PATTERNS.ogType, 
    `<meta property="og:type" content="${escapeHtml(meta.ogType)}">`);
  html = html.replace(META_PATTERNS.ogUrl, 
    `<meta property="og:url" content="${escapeHtml(meta.ogUrl)}">`);
  html = html.replace(META_PATTERNS.ogImage, 
    `<meta property="og:image" content="${escapeHtml(meta.ogImage)}">`);
  
  // Replace Twitter tags
  html = html.replace(META_PATTERNS.twitterCard, 
    `<meta name="twitter:card" content="${escapeHtml(meta.twitterCard)}">`);
  html = html.replace(META_PATTERNS.twitterTitle, 
    `<meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}">`);
  html = html.replace(META_PATTERNS.twitterDescription, 
    `<meta name="twitter:description" content="${escapeHtml(meta.ogDescription)}">`);
  html = html.replace(META_PATTERNS.twitterImage, 
    `<meta name="twitter:image" content="${escapeHtml(meta.ogImage)}">`);
  
  // Inject canonical URL after viewport meta if not present
  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      /<meta\s+name="viewport"[^>]*>/i,
      `$&\n  <link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}">`
    );
  }
  
  // Inject JSON-LD before </head>
  if (meta.jsonLd) {
    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`;
    html = html.replace('</head>', `${jsonLdScript}\n</head>`);
  }
  
  return html;
}

async function getProductMeta(productId: string): Promise<MetaTags | null> {
  try {
    const product = getDb().prepare(`
      SELECT p.*, a.display_name as agent_name 
      FROM products p 
      LEFT JOIN agents a ON p.agent_id = a.id 
      WHERE p.id = ? AND p.hidden = 0
    `).get(productId) as any;
    
    if (!product) return null;
    
    const title = `${product.title} - Barg'N Monster`;
    const description = product.description 
      ? truncate(product.description, 160)
      : `Check out this suspicious item from ${product.agent_name || "an anonymous agent"}. No questions asked.`;
    const price = product.price_cents 
      ? `$${(product.price_cents / 100).toFixed(2)}`
      : "Price: ASK";
    
    return {
      title,
      description,
      ogTitle: product.title,
      ogDescription: `${price} - ${description}`,
      ogUrl: `${BASE_URL}/product/${productId}`,
      ogImage: product.image_url || PRODUCT_IMAGE,
      ogType: "product",
      twitterCard: "summary_large_image",
      canonicalUrl: `${BASE_URL}/product/${productId}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.title,
        "description": product.description || description,
        "image": product.image_url || PRODUCT_IMAGE,
        "url": `${BASE_URL}/product/${productId}`,
        "brand": {
          "@type": "Organization",
          "name": product.agent_name || "Unknown Agent"
        },
        ...(product.price_cents && {
          "offers": {
            "@type": "Offer",
            "price": (product.price_cents / 100).toFixed(2),
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock"
          }
        })
      }
    };
  } catch (e) {
    console.error("Error fetching product meta:", e);
    return null;
  }
}

async function getAgentMeta(agentId: string): Promise<MetaTags | null> {
  try {
    const agent = getDb().prepare(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM products WHERE agent_id = a.id AND hidden = 0) as product_count,
        (SELECT AVG(score) FROM ratings WHERE target_type = 'agent' AND target_id = a.id) as avg_rating
      FROM agents a 
      WHERE a.id = ? AND a.status != 'suspended'
    `).get(agentId) as any;
    
    if (!agent) return null;
    
    const name = agent.display_name || "Anonymous Agent";
    const title = `${name} - AI Sales Agent - Barg'N Monster`;
    const ratingText = agent.avg_rating ? ` Rated ${agent.avg_rating.toFixed(1)}/5.` : "";
    const description = agent.bio 
      ? truncate(agent.bio, 140)
      : `${name} is an AI agent selling ${agent.product_count || 0} products.${ratingText} Definitely trustworthy.`;
    
    return {
      title,
      description,
      ogTitle: `${name} - AI Sales Agent`,
      ogDescription: description,
      ogUrl: `${BASE_URL}/agent/${agentId}`,
      ogImage: agent.avatar_url || AGENT_IMAGE,
      ogType: "profile",
      twitterCard: "summary_large_image",
      canonicalUrl: `${BASE_URL}/agent/${agentId}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": name,
        "description": agent.bio || description,
        "image": agent.avatar_url || AGENT_IMAGE,
        "url": `${BASE_URL}/agent/${agentId}`,
        ...(agent.avg_rating && {
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": agent.avg_rating.toFixed(1),
            "bestRating": "5",
            "worstRating": "1"
          }
        })
      }
    };
  } catch (e) {
    console.error("Error fetching agent meta:", e);
    return null;
  }
}

async function getUserMeta(userId: string): Promise<MetaTags | null> {
  try {
    const user = getDb().prepare(`
      SELECT h.*,
        (SELECT COUNT(*) FROM requests WHERE requester_type = 'human' AND requester_id = h.id AND deleted_at IS NULL) as request_count
      FROM humans h 
      WHERE h.id = ?
    `).get(userId) as any;
    
    if (!user) return null;
    
    const name = user.display_name || "Anonymous Shopper";
    const title = `${name} - Barg'N Monster`;
    const description = `${name} is a human shopper on Barg'N Monster. They've posted ${user.request_count || 0} requests. Probably not a robot.`;
    
    return {
      title,
      description,
      ogTitle: `${name} - Shopper Profile`,
      ogDescription: description,
      ogUrl: `${BASE_URL}/user/${userId}`,
      ogImage: USER_IMAGE,
      ogType: "profile",
      twitterCard: "summary",
      canonicalUrl: `${BASE_URL}/user/${userId}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": name,
        "url": `${BASE_URL}/user/${userId}`
      }
    };
  } catch (e) {
    console.error("Error fetching user meta:", e);
    return null;
  }
}

async function getRequestMeta(requestId: string): Promise<MetaTags | null> {
  try {
    const request = getDb().prepare(`
      SELECT r.*, 
        CASE r.requester_type 
          WHEN 'human' THEN (SELECT display_name FROM humans WHERE id = r.requester_id)
          WHEN 'agent' THEN (SELECT display_name FROM agents WHERE id = r.requester_id)
        END as requester_name,
        (SELECT COUNT(*) FROM pitches WHERE request_id = r.id AND hidden = 0) as pitch_count
      FROM requests r 
      WHERE r.id = ? AND r.deleted_at IS NULL AND r.hidden = 0
    `).get(requestId) as any;
    
    if (!request) return null;
    
    const requesterName = request.requester_name || "Anonymous";
    const isAgent = request.requester_type === "agent";
    const requesterType = isAgent ? "🤖 Agent" : "👤 Shopper";
    const title = `${truncate(request.text, 60)} - Barg'N Monster`;
    const description = `${requesterType} ${requesterName} is looking for: "${truncate(request.text, 100)}" - ${request.pitch_count || 0} agents circling.`;
    
    const budgetText = request.budget_min_cents || request.budget_max_cents
      ? ` Budget: ${request.budget_min_cents ? "$" + (request.budget_min_cents / 100).toFixed(0) : "?"} - ${request.budget_max_cents ? "$" + (request.budget_max_cents / 100).toFixed(0) : "?"}.`
      : "";
    
    return {
      title,
      description: description + budgetText,
      ogTitle: `Request: ${truncate(request.text, 50)}`,
      ogDescription: description + budgetText,
      ogUrl: `${BASE_URL}/request/${requestId}`,
      ogImage: DEFAULT_IMAGE,
      ogType: "article",
      twitterCard: "summary_large_image",
      canonicalUrl: `${BASE_URL}/request/${requestId}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Question",
        "name": truncate(request.text, 100),
        "text": request.text,
        "author": {
          "@type": isAgent ? "Organization" : "Person",
          "name": requesterName
        },
        "answerCount": request.pitch_count || 0,
        "dateCreated": new Date(request.created_at * 1000).toISOString()
      }
    };
  } catch (e) {
    console.error("Error fetching request meta:", e);
    return null;
  }
}

export { 
  injectMetaTags, 
  getProductMeta, 
  getAgentMeta, 
  getUserMeta, 
  getRequestMeta,
  type MetaTags 
};
