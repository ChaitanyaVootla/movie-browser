// Beta verification: TTFB + full response for key pages (perf-rule playbook).
// Run from project dir: node scripts/tmp-beta-verify.mjs
import { chromium } from "@playwright/test";

const BASE = "https://beta.themoviebrowser.com";
const targets = [
  ["home", "/"],
  ["movie", "/movie/550-fight-club"],
  ["series", "/series/1396-breaking-bad"],
  ["person", "/person/287-brad-pitt"],
];

const browser = await chromium.launch();
const results = [];
for (const [name, path] of targets) {
  const page = await browser.newPage();
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    const nav = await page.evaluate(() => {
      const x = performance.getEntriesByType("navigation")[0];
      return {
        ttfb: Math.round(x.responseStart - x.requestStart),
        resp: Math.round(x.responseEnd - x.requestStart),
      };
    });
    const title = await page.title();
    results.push(`${name}: ttfb=${nav.ttfb}ms resp=${nav.resp}ms status-ok title="${title.slice(0, 40)}"`);
  } catch (e) {
    results.push(`${name}: FAILED ${String(e).slice(0, 120)}`);
  }
  await page.close();
}
await browser.close();
console.log(results.join("\n"));
