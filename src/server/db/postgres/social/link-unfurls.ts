import { UnfurlProvider, UnfurlStatus } from "@prisma/client";
import { prisma } from "@/server/db/postgres";

/** Serializable unfurl record shared by the DB layer, the unfurl service, and the renderer. */
export interface LinkUnfurlDto {
  urlHash: string;
  url: string;
  domain: string;
  status: "OK" | "FAILED";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  provider: "GENERIC" | "YOUTUBE";
  youtubeId: string | null;
}

export interface UpsertUnfurlInput {
  urlHash: string;
  url: string;
  domain: string;
  status: "OK" | "FAILED";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  provider: "GENERIC" | "YOUTUBE";
  youtubeId: string | null;
}

function toDto(row: {
  urlHash: string;
  url: string;
  domain: string;
  status: UnfurlStatus;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  provider: UnfurlProvider;
  youtubeId: string | null;
}): LinkUnfurlDto {
  return {
    urlHash: row.urlHash,
    url: row.url,
    domain: row.domain,
    status: row.status === UnfurlStatus.OK ? "OK" : "FAILED",
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    faviconUrl: row.faviconUrl,
    provider: row.provider === UnfurlProvider.YOUTUBE ? "YOUTUBE" : "GENERIC",
    youtubeId: row.youtubeId,
  };
}

const SELECT = {
  urlHash: true,
  url: true,
  domain: true,
  status: true,
  title: true,
  description: true,
  imageUrl: true,
  faviconUrl: true,
  provider: true,
  youtubeId: true,
} as const;

export async function getUnfurl(urlHash: string): Promise<LinkUnfurlDto | null> {
  const row = await prisma.linkUnfurl.findUnique({ where: { urlHash }, select: SELECT });
  return row ? toDto(row) : null;
}

/** Batch lookup for the render path (one query for a page of comments). */
export async function getUnfurlsByHashes(urlHashes: string[]): Promise<Map<string, LinkUnfurlDto>> {
  if (urlHashes.length === 0) return new Map();
  const rows = await prisma.linkUnfurl.findMany({
    where: { urlHash: { in: urlHashes } },
    select: SELECT,
  });
  return new Map(rows.map((r) => [r.urlHash, toDto(r)]));
}

export async function upsertUnfurl(input: UpsertUnfurlInput): Promise<void> {
  const data = {
    url: input.url,
    domain: input.domain,
    status: input.status === "OK" ? UnfurlStatus.OK : UnfurlStatus.FAILED,
    title: input.title,
    description: input.description,
    imageUrl: input.imageUrl,
    faviconUrl: input.faviconUrl,
    provider: input.provider === "YOUTUBE" ? UnfurlProvider.YOUTUBE : UnfurlProvider.GENERIC,
    youtubeId: input.youtubeId,
    fetchedAt: new Date(),
  };
  await prisma.linkUnfurl.upsert({
    where: { urlHash: input.urlHash },
    create: { urlHash: input.urlHash, ...data },
    update: data,
  });
}
