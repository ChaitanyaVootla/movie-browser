// Back-button scroll-restoration check (browse, search, library tabs).
//
// Run from the repo root (so @playwright/test resolves) against a LOCAL server:
//   BASE_URL=http://localhost:3009 node scripts/verify-scroll-restore.mjs
//   BASE_URL=... AUTH=1 node scripts/verify-scroll-restore.mjs   # + library/watchlist
//                                                               # (needs ENABLE_TEST_AUTH=true)
// Do NOT point it at prod in parallel with other audits (performance.md).
//
// For each surface: scroll deep (loading extra infinite pages where relevant),
// open the card nearest the viewport centre, wait for the detail page, press
// Back, and assert (a) we're back on the same URL, (b) scrollY is within
// TOLERANCE of where we left, (c) at least as many cards are rendered as before.
import { chromium } from "@playwright/test";

const BASE = (process.env.BASE_URL || "http://localhost:3009").replace(/\/$/, "");
const TOLERANCE = 120;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const browser = await chromium.launch();
const results = [];

async function newPage(viewport) {
  const ctx = await browser.newContext({ serviceWorkers: "block", userAgent: UA, viewport });
  const page = await ctx.newPage();
  // proxy.ts 429s HeadlessChrome client hints — force clean ones on every request.
  await page.route("**/*", (r) =>
    r.continue({
      headers: {
        ...r.request().headers(),
        "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "user-agent": UA,
      },
    })
  );
  if (process.env.AUTH === "1") {
    const res = await ctx.request.post(`${BASE}/api/test-auth/login`);
    if (!res.ok()) throw new Error(`test-auth login failed: ${res.status()}`);
  }
  return page;
}

const cardSel = 'a[href^="/movie/"], a[href^="/series/"]';
const countCards = (page) => page.locator(cardSel).count();

async function check(name, url, { viewport = { width: 1440, height: 900 }, scrollPasses = 6 } = {}) {
  const page = await newPage(viewport);
  try {
    const nav = await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    if (nav?.status() !== 200) throw new Error(`status ${nav?.status()}`);
    await page.waitForSelector(cardSel, { timeout: 15000 });
    // Scroll in steps so infinite scroll loads more pages.
    for (let i = 0; i < scrollPasses; i += 1) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(900);
    }
    await page.waitForLoadState("networkidle");
    const before = await page.evaluate(() => ({ y: Math.round(window.scrollY), url: location.href }));
    const cardsBefore = await countCards(page);
    // Click the visible card closest to the viewport centre.
    const href = await page.evaluate((sel) => {
      const mid = window.innerHeight / 2;
      let best = null;
      for (const a of document.querySelectorAll(sel)) {
        const r = a.getBoundingClientRect();
        if (r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (!best || d < best.d) best = { d, el: a };
      }
      if (!best) return null;
      best.el.setAttribute("data-scroll-test", "1");
      return best.el.getAttribute("href");
    }, cardSel);
    if (!href) throw new Error("no visible card to click");
    await page.click('[data-scroll-test="1"]');
    await page.waitForURL((u) => u.pathname !== new URL(before.url).pathname, { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.goBack();
    await page.waitForTimeout(2500); // restore loop: commit + settle
    const after = await page.evaluate(() => ({ y: Math.round(window.scrollY), url: location.href }));
    const cardsAfter = await countCards(page);
    const ok =
      after.url === before.url && Math.abs(after.y - before.y) <= TOLERANCE && cardsAfter >= cardsBefore;
    results.push({ name, ok, href, before: before.y, after: after.y, cardsBefore, cardsAfter, urlOk: after.url === before.url });
  } catch (e) {
    results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    await page.context().close();
  }
}

await check("browse (desktop, infinite pages)", "/browse");
await check("browse filtered (?genres=28)", "/browse?genres=28");
await check("browse (mobile 390x844)", "/browse", { viewport: { width: 390, height: 844 } });
await check("topic grid", "/topics/genre-action-movie", { scrollPasses: 4 });
await check("search results", "/search?q=star", { scrollPasses: 3 });
if (process.env.AUTH === "1") {
  await check("library watchlist (movies)", "/library?tab=watchlist&type=movies", { scrollPasses: 3 });
  await check("library watched", "/library?tab=watched", { scrollPasses: 3 });
  await check("library ratings", "/library?tab=ratings", { scrollPasses: 3 });
}

await browser.close();
console.table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
