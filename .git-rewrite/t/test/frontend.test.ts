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
      
      // Extract all inline script contents
      const scriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      
      while ((match = scriptRegex.exec(content)) !== null) {
        const scriptContent = match[1].trim();
        if (!scriptContent) continue;
        
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
