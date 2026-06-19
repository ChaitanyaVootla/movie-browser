import * as cheerio from "cheerio";

export interface UnfurlMeta {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

const MAX_TITLE = 2000;
const MAX_DESC = 2000;

function clamp(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Pure HTML → metadata. Reads OG tags, falling back to twitter:* and the bare
 * <title>/meta[name=description]. Never executes scripts, never resolves URLs
 * (the image URL is stored verbatim; the renderer decides whether to show it).
 */
export function parseOgMeta(html: string): UnfurlMeta {
  const $ = cheerio.load(html);
  const meta = (selectors: string[]): string | undefined => {
    for (const sel of selectors) {
      const content = $(sel).attr("content");
      if (content && content.trim()) return content;
    }
    return undefined;
  };

  const title =
    clamp(meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']), MAX_TITLE) ??
    clamp($("title").first().text() || undefined, MAX_TITLE);
  const description = clamp(
    meta([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]),
    MAX_DESC
  );
  const imageUrl = clamp(
    meta(['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']),
    2048
  );

  return { title, description, imageUrl };
}
