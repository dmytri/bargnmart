import { describe, it, expect } from "bun:test";
import { readdir } from "fs/promises";
import { join } from "path";

describe("Frontend JavaScript Syntax", () => {
  it("all HTML files have valid inline JavaScript", async () => {
    const publicDir = join(import.meta.dir, "../public");
    const files = await readdir(publicDir);
    const htmlFiles = files.filter(f => f.endsWith(".html"));
    
    for (const file of htmlFiles) {
      const content = await Bun.file(join(publicDir, file)).text();
      
      // Extract all inline script contents (excluding JSON-LD and other non-JS types)
      const scriptRegex = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
      let match;
      
      while ((match = scriptRegex.exec(content)) !== null) {
        const scriptAttrs = match[1] || "";
        const scriptContent = match[2].trim();
        if (!scriptContent) continue;
        
        // Skip non-JavaScript script types (JSON-LD, templates, etc.)
        if (scriptAttrs.includes('type="application/ld+json"') ||
            scriptAttrs.includes("type='application/ld+json'") ||
            scriptAttrs.includes('type="text/template"') ||
            scriptAttrs.includes('type="text/x-template"')) {
          continue;
        }
        
        // Try to parse the JavaScript
        try {
          new Function(scriptContent);
        } catch (e: any) {
          throw new Error(`Syntax error in ${file}: ${e.message}\n\nScript content:\n${scriptContent.slice(0, 500)}...`);
        }
      }
    }
  });
});
