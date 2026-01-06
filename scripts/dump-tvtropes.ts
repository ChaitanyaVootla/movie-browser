#!/usr/bin/env npx tsx
/**
 * TV Tropes Page Dumper
 *
 * Dumps raw TV Tropes page data to understand the structure
 * for building an automated scraper.
 *
 * Usage:
 *   npx tsx scripts/dump-tvtropes.ts <tv_tropes_id>
 *   npx tsx scripts/dump-tvtropes.ts Film/DunePartTwo
 *   npx tsx scripts/dump-tvtropes.ts Film/FightClub
 *   npx tsx scripts/dump-tvtropes.ts Film/Inception
 *
 * Output:
 *   Creates ./data/dumps/tvtropes/<sanitized_id>/ with:
 *   - raw.html      (Full page HTML)
 *   - structure.json (Page structure analysis)
 *   - tropes.json   (Extracted tropes list)
 *   - content.md    (Human-readable content dump)
 */

import { config } from "dotenv";
import { resolve, join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import * as cheerio from "cheerio";

config({ path: resolve(process.cwd(), ".env.local") });

const DEBUG = process.argv.includes("--debug") || process.argv.includes("-d");

function log(message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response;
      if (response.status === 404) throw new Error(`Page not found: ${url}`);
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Failed after retries");
}

interface TVTropesContent {
  title: string;
  url: string;
  namespace: string;
  
  // Page description/intro
  description: string;
  
  // All tropes mentioned (the main content!)
  tropes: Array<{
    name: string;
    description: string;
    examples?: string[];
  }>;
  
  // Subpages linked
  subpages: string[];
  
  // Related pages
  relatedPages: string[];
  
  // Categories/indexes
  indexes: string[];
  
  // Raw folder structure
  folders: Record<string, string[]>;
}

async function dumpTVTropes(tvTropesId: string) {
  const url = `https://tvtropes.org/pmwiki/pmwiki.php/${tvTropesId}`;
  console.log(`📺 Fetching TV Tropes: ${tvTropesId}`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Create output directory
    const sanitizedId = tvTropesId.replace(/\//g, "_");
    const outputDir = join(process.cwd(), "data", "dumps", "tvtropes", sanitizedId);
    mkdirSync(outputDir, { recursive: true });

    // Save raw HTML
    writeFileSync(join(outputDir, "raw.html"), html);
    console.log(`   ✅ Saved raw HTML (${(html.length / 1024).toFixed(1)}KB)`);

    // Extract content
    const content: TVTropesContent = {
      title: $("h1.entry-title").text().trim() || $("title").text().trim(),
      url,
      namespace: tvTropesId.split("/")[0],
      description: "",
      tropes: [],
      subpages: [],
      relatedPages: [],
      indexes: [],
      folders: {},
    };

    // Get page description (intro text before tropes)
    const mainContent = $("#main-article");
    const introText: string[] = [];
    mainContent.children().each((_, el) => {
      const $el = $(el);
      if ($el.hasClass("folder") || $el.is("hr")) return false; // Stop at first folder/divider
      if ($el.is("p")) {
        introText.push($el.text().trim());
      }
      return true;
    });
    content.description = introText.join("\n\n");

    // Extract tropes from folders (main content)
    $(".folder").each((_, folder) => {
      const $folder = $(folder);
      const folderTitle = $folder.find(".folderlabel").text().trim() || "Main";
      const folderItems: string[] = [];
      
      $folder.find("ul li").each((_, li) => {
        const $li = $(li);
        const text = $li.text().trim();
        if (text) {
          // TV Tropes format: "TropeName: Description..."
          const match = text.match(/^([^:]+):\s*(.*)$/);
          if (match) {
            content.tropes.push({
              name: match[1].trim(),
              description: match[2].trim(),
            });
            folderItems.push(text);
          } else {
            // Some entries are just trope names
            const tropeName = $li.find("a").first().text().trim();
            if (tropeName) {
              content.tropes.push({
                name: tropeName,
                description: text,
              });
              folderItems.push(text);
            }
          }
        }
      });
      
      if (folderItems.length > 0) {
        content.folders[folderTitle] = folderItems;
      }
    });

    // Also check non-folder ul lists (some pages don't use folders)
    mainContent.children("ul").each((_, ul) => {
      $(ul).find("li").each((_, li) => {
        const $li = $(li);
        const tropeName = $li.find("a.twikilink").first().text().trim();
        const text = $li.text().trim();
        if (tropeName && text) {
          content.tropes.push({
            name: tropeName,
            description: text,
          });
        }
      });
    });

    // Get subpages (tabs/linked pages for this work)
    $(".subpage-links a, .pagetabs a").each((_, a) => {
      const href = $(a).attr("href") || "";
      const text = $(a).text().trim();
      if (href.includes(tvTropesId.split("/")[1]) && text) {
        content.subpages.push(text);
      }
    });

    // Get indexes (categories this page belongs to)
    $(".index-list a, .page-tags a").each((_, a) => {
      const text = $(a).text().trim();
      if (text) content.indexes.push(text);
    });

    // Get related pages (see also, etc.)
    $('a[href*="/pmwiki/pmwiki.php/"]').each((_, a) => {
      const href = $(a).attr("href") || "";
      const text = $(a).text().trim();
      if (href && text && !href.includes(tvTropesId)) {
        const match = href.match(/pmwiki\.php\/(.+)/);
        if (match) {
          content.relatedPages.push(match[1]);
        }
      }
    });

    // Dedupe
    content.subpages = [...new Set(content.subpages)];
    content.indexes = [...new Set(content.indexes)];
    content.relatedPages = [...new Set(content.relatedPages)].slice(0, 50);

    // Save structure analysis
    const structure = {
      title: content.title,
      url: content.url,
      namespace: content.namespace,
      descriptionLength: content.description.length,
      tropesCount: content.tropes.length,
      foldersCount: Object.keys(content.folders).length,
      subpagesCount: content.subpages.length,
      indexesCount: content.indexes.length,
      relatedPagesCount: content.relatedPages.length,
      folders: Object.fromEntries(
        Object.entries(content.folders).map(([k, v]) => [k, v.length])
      ),
    };
    writeFileSync(join(outputDir, "structure.json"), JSON.stringify(structure, null, 2));
    console.log(`   ✅ Saved structure analysis`);

    // Save extracted tropes
    writeFileSync(join(outputDir, "tropes.json"), JSON.stringify(content.tropes, null, 2));
    console.log(`   ✅ Saved ${content.tropes.length} tropes`);

    // Save human-readable content dump
    const markdown = `# ${content.title}

**URL:** ${content.url}
**Namespace:** ${content.namespace}
**Tropes Found:** ${content.tropes.length}

## Description

${content.description || "(No description found)"}

## Subpages

${content.subpages.length > 0 ? content.subpages.map(s => `- ${s}`).join("\n") : "(None)"}

## Indexes (Categories)

${content.indexes.length > 0 ? content.indexes.slice(0, 20).map(i => `- ${i}`).join("\n") : "(None)"}

## Tropes by Folder

${Object.entries(content.folders).map(([folder, items]) => `
### ${folder} (${items.length} items)

${items.slice(0, 10).map(i => `- ${i.slice(0, 200)}${i.length > 200 ? "..." : ""}`).join("\n")}
${items.length > 10 ? `\n... and ${items.length - 10} more` : ""}
`).join("\n")}

## Sample Tropes (First 20)

${content.tropes.slice(0, 20).map(t => `- **${t.name}**: ${t.description.slice(0, 150)}${t.description.length > 150 ? "..." : ""}`).join("\n")}
`;

    writeFileSync(join(outputDir, "content.md"), markdown);
    console.log(`   ✅ Saved content.md`);

    // Save full content
    writeFileSync(join(outputDir, "full.json"), JSON.stringify(content, null, 2));
    console.log(`   ✅ Saved full.json`);

    // Print summary
    console.log(`\n📊 SUMMARY`);
    console.log(`   Title: ${content.title}`);
    console.log(`   Description: ${content.description.length} chars`);
    console.log(`   Tropes: ${content.tropes.length}`);
    console.log(`   Folders: ${Object.keys(content.folders).length}`);
    console.log(`   Subpages: ${content.subpages.length}`);
    console.log(`   Indexes: ${content.indexes.length}`);
    console.log(`\n📁 Output: ${outputDir}/`);

    return content;
  } catch (error) {
    console.error(`❌ Failed:`, (error as Error).message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith("-"));

  if (args.length === 0) {
    console.log(`
Usage: npx tsx scripts/dump-tvtropes.ts <tv_tropes_id>

The TV Tropes ID is the part after pmwiki.php/ in the URL.

Examples:
  npx tsx scripts/dump-tvtropes.ts Film/DunePartTwo
  npx tsx scripts/dump-tvtropes.ts Film/FightClub
  npx tsx scripts/dump-tvtropes.ts Film/Inception
  npx tsx scripts/dump-tvtropes.ts Film/TheMatrix
  npx tsx scripts/dump-tvtropes.ts Series/BreakingBad

You can find the TV Tropes ID from:
1. The movie's Wikidata entry (P4835)
2. Search on tvtropes.org and copy from URL
`);
    process.exit(1);
  }

  await dumpTVTropes(args[0]);
}

main();

