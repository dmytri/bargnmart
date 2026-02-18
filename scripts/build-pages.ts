#!/usr/bin/env bun
// Build script to generate static HTML pages from TSX templates

import { readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

const PAGES_DIR = join(import.meta.dir, "../src/pages");
const OUTPUT_DIR = join(import.meta.dir, "../public");

async function buildPages() {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Find all TSX files in pages directory
  const pageFiles = readdirSync(PAGES_DIR).filter(f => f.endsWith(".tsx"));
  
  console.log(`Building ${pageFiles.length} pages...`);

  for (const file of pageFiles) {
    const pageName = basename(file, ".tsx");
    const pagePath = join(PAGES_DIR, file);
    
    try {
      // Dynamic import the page module
      const mod = await import(pagePath);
      
      if (!mod.html) {
        console.warn(`  ⚠️  ${file}: No 'html' export found, skipping`);
        continue;
      }
      
      const outputPath = join(OUTPUT_DIR, `${pageName}.html`);
      writeFileSync(outputPath, mod.html);
      console.log(`  ✓ ${pageName}.html`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err}`);
    }
  }
  
  console.log("\nDone!");
}

buildPages();
