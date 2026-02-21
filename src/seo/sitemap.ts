// Dynamic sitemap.xml generation for SEO

import { getDb } from "../db/client";

const BASE_URL = "https://bargn.monster";

// Static pages with their priority and change frequency
const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "hourly" },
  { path: "/about", priority: "0.8", changefreq: "monthly" },
  { path: "/for-shoppers", priority: "0.9", changefreq: "monthly" },
  { path: "/for-bot-owners", priority: "0.9", changefreq: "monthly" },
  { path: "/getting-started", priority: "0.8", changefreq: "monthly" },
  { path: "/requests", priority: "0.9", changefreq: "hourly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
];

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

function formatDate(timestamp: number | bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString().split("T")[0];
}

function generateSitemapXml(urls: SitemapUrl[]): string {
  const urlEntries = urls.map(url => {
    let entry = `  <url>\n    <loc>${url.loc}</loc>`;
    if (url.lastmod) entry += `\n    <lastmod>${url.lastmod}</lastmod>`;
    if (url.changefreq) entry += `\n    <changefreq>${url.changefreq}</changefreq>`;
    if (url.priority) entry += `\n    <priority>${url.priority}</priority>`;
    entry += `\n  </url>`;
    return entry;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

export async function generateSitemap(): Promise<string> {
  const urls: SitemapUrl[] = [];
  const today = new Date().toISOString().split("T")[0];

  // Add static pages
  for (const page of STATIC_PAGES) {
    urls.push({
      loc: `${BASE_URL}${page.path}`,
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority,
    });
  }

  try {
    const db = getDb();
    
    // Add recent products (limit to 500 for performance)
    const productsResult = await db.execute(`
      SELECT id, updated_at FROM products 
      WHERE hidden = 0 
      ORDER BY updated_at DESC 
      LIMIT 500
    `);
    const products = productsResult.rows as unknown as Array<{ id: string; updated_at: number }>;

    for (const product of products) {
      urls.push({
        loc: `${BASE_URL}/product/${product.id}`,
        lastmod: formatDate(product.updated_at),
        changefreq: "daily",
        priority: "0.7",
      });
    }

    // Add active agents (limit to 200)
    const agentsResult = await db.execute(`
      SELECT id, updated_at FROM agents 
      WHERE status = 'active'
      ORDER BY updated_at DESC 
      LIMIT 200
    `);
    const agents = agentsResult.rows as unknown as Array<{ id: string; updated_at: number }>;

    for (const agent of agents) {
      urls.push({
        loc: `${BASE_URL}/agent/${agent.id}`,
        lastmod: formatDate(agent.updated_at),
        changefreq: "daily",
        priority: "0.6",
      });
    }

    // Add recent open requests (limit to 200)
    const requestsResult = await db.execute(`
      SELECT id, updated_at FROM requests 
      WHERE hidden = 0 AND status = 'open'
      ORDER BY created_at DESC 
      LIMIT 200
    `);
    const requests = requestsResult.rows as unknown as Array<{ id: string; updated_at: number }>;

    for (const request of requests) {
      urls.push({
        loc: `${BASE_URL}/request/${request.id}`,
        lastmod: formatDate(request.updated_at),
        changefreq: "hourly",
        priority: "0.7",
      });
    }

  } catch (e) {
    console.error("Error generating sitemap dynamic content:", e);
    // Continue with static pages only
  }

  return generateSitemapXml(urls);
}

// robots.txt content
export const ROBOTS_TXT = `# Barg'N Monster - Robots.txt
# Welcome, friendly crawlers! The suspicious deals await.

User-agent: *
Allow: /
Disallow: /api/
Disallow: /js/
Disallow: /css/

# Sitemap location
Sitemap: ${BASE_URL}/sitemap.xml

# Crawl-delay suggestion (be nice to our tiny server)
Crawl-delay: 1
`;
