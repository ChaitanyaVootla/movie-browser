/**
 * Background Enrichment Job
 *
 * Finds popular movies/series without AI data and enriches them.
 * Can be triggered via API or scheduled job.
 */

import { exec } from "child_process";
import { promisify } from "util";

import { prisma } from "@/server/db/postgres";
import { dataLogger } from "@/lib/logger";

const execAsync = promisify(exec);
const log = dataLogger.child({ module: "enrich-job" });

export type EnrichStrategy = "popular" | "recent" | "missing";
export type MediaType = "movie" | "series" | "both";

export interface EnrichJobOptions {
  mediaType: MediaType;
  strategy: EnrichStrategy;
  limit: number;
  dryRun?: boolean;
}

export interface EnrichJobResult {
  processed: number;
  successful: number;
  failed: number;
  items: Array<{
    id: number;
    type: "movie" | "series";
    title: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Sanitize ID for use in shell command.
 * Ensures we only pass clean numeric strings.
 */
function sanitizeId(id: number): string {
  const sanitized = Math.floor(Math.abs(id));
  return String(sanitized);
}

/**
 * Get items that need enrichment based on strategy
 */
async function getItemsToEnrich(
  options: EnrichJobOptions
): Promise<Array<{ id: number; type: "movie" | "series"; title: string }>> {
  const items: Array<{ id: number; type: "movie" | "series"; title: string }> = [];

  // Get movies without AI data
  if (options.mediaType === "movie" || options.mediaType === "both") {
    const movies = await prisma.movie.findMany({
      where: {
        aiData: null, // No AI data yet
        ...(options.strategy === "popular" ? { popularity: { gt: 10 } } : {}),
        ...(options.strategy === "recent"
          ? {
              createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }
          : {}),
      },
      orderBy:
        options.strategy === "popular" ? { popularity: "desc" } : { createdAt: "desc" },
      take:
        options.mediaType === "both" ? Math.floor(options.limit / 2) : options.limit,
      select: { id: true, title: true },
    });

    items.push(...movies.map((m) => ({ id: m.id, type: "movie" as const, title: m.title })));
  }

  // Get series without AI data
  if (options.mediaType === "series" || options.mediaType === "both") {
    const series = await prisma.series.findMany({
      where: {
        aiData: null,
        ...(options.strategy === "popular" ? { popularity: { gt: 10 } } : {}),
        ...(options.strategy === "recent"
          ? {
              createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }
          : {}),
      },
      orderBy:
        options.strategy === "popular" ? { popularity: "desc" } : { createdAt: "desc" },
      take:
        options.mediaType === "both" ? Math.floor(options.limit / 2) : options.limit,
      select: { id: true, name: true },
    });

    items.push(...series.map((s) => ({ id: s.id, type: "series" as const, title: s.name })));
  }

  return items;
}

/**
 * Enrich a single item
 */
async function enrichItem(
  id: number,
  type: "movie" | "series"
): Promise<{ success: boolean; error?: string }> {
  const safeId = sanitizeId(id);

  try {
    // Run enrichment script
    const enrichScript =
      type === "series"
        ? `npx tsx scripts/enrich-series.ts ${safeId}`
        : `npx tsx scripts/enrich-content.ts ${safeId}`;

    await execAsync(enrichScript, {
      timeout: 120000, // 2 min timeout
      cwd: process.cwd(),
      env: { ...process.env },
    });

    // Run summarization script
    await execAsync(`npx tsx scripts/summarize-movies.ts ${safeId}`, {
      timeout: 180000, // 3 min timeout
      cwd: process.cwd(),
      env: { ...process.env },
    });

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ id, type, error: message }, "Enrichment failed");
    return { success: false, error: message };
  }
}

/**
 * Run the enrichment job
 */
export async function runEnrichJob(options: EnrichJobOptions): Promise<EnrichJobResult> {
  log.info({ options }, "Starting enrichment job");

  const items = await getItemsToEnrich(options);

  if (options.dryRun) {
    log.info({ count: items.length }, "Dry run - would enrich these items");
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      items: items.map((i) => ({ ...i, success: true })),
    };
  }

  const results: EnrichJobResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    items: [],
  };

  for (const item of items) {
    const result = await enrichItem(item.id, item.type);
    results.processed++;

    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
    }

    results.items.push({
      ...item,
      success: result.success,
      error: result.error,
    });

    log.info(
      { id: item.id, type: item.type, success: result.success },
      `Enriched ${item.title}`
    );
  }

  log.info(
    {
      processed: results.processed,
      successful: results.successful,
      failed: results.failed,
    },
    "Enrichment job completed"
  );

  return results;
}
