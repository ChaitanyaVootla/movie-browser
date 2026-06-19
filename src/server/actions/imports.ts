"use server";

import { z } from "zod";
import { requirePgUserId } from "@/lib/user-id";
import { userApiLogger } from "@/lib/logger";
import { prisma } from "@/server/db/postgres";
import { importFileStorage } from "@/server/services/import/storage";
import { createImportJob } from "@/server/services/import/runner";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SourceSchema = z.enum(["LETTERBOXD", "TRAKT", "IMDB"]);

function actionError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  userApiLogger.error({ action, error: message });
  return { success: false as const, error: message };
}

/** Upload (FormData: file + source) -> background job -> per-row report. */
export async function startImport(formData: FormData) {
  try {
    const userId = await requirePgUserId();
    const source = SourceSchema.parse(formData.get("source"));
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false as const, error: "Missing file" };
    }
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return { success: false as const, error: "File must be between 1 byte and 50MB" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileRef = await importFileStorage.save(userId, file.name, buffer);
    const jobId = await createImportJob(userId, source, fileRef);
    return { success: true as const, jobId };
  } catch (error: unknown) {
    return actionError("startImport", error);
  }
}

const JobIdSchema = z.object({ jobId: z.number().int().positive() });

export async function getImportJob(input: z.infer<typeof JobIdSchema>) {
  try {
    const { jobId } = JobIdSchema.parse(input);
    const userId = await requirePgUserId();
    const job = await prisma.importJob.findFirst({ where: { id: jobId, userId } });
    return job
      ? { success: true as const, job }
      : { success: false as const, error: "Not found" };
  } catch (error: unknown) {
    return actionError("getImportJob", error);
  }
}

export async function listImportJobs() {
  try {
    const userId = await requirePgUserId();
    const jobs = await prisma.importJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { success: true as const, jobs };
  } catch (error: unknown) {
    return actionError("listImportJobs", error);
  }
}

// ---------------------------------------------------------------------------
// UI contract bridge (Appendix A) — Task 24
// ---------------------------------------------------------------------------

import type { ImportJobDTO } from "@/types/social";
import type { ImportJob } from "@prisma/client";

interface StoredImportStats {
  rowsTotal: number;
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

function toImportJobDTO(job: ImportJob): ImportJobDTO {
  const stats = (job.stats ?? null) as StoredImportStats | null;
  return {
    id: job.id,
    source: job.source,
    status: job.status,
    stats: stats
      ? { ...stats, processed: stats.imported + stats.skipped + stats.errors.length }
      : null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export async function startImportAction(
  formData: FormData
): Promise<{ ok: true; jobId: number } | { ok: false; error: string }> {
  const result = await startImport(formData);
  return result.success ? { ok: true, jobId: result.jobId } : { ok: false, error: result.error };
}

export async function getImportJobs(): Promise<ImportJobDTO[]> {
  const result = await listImportJobs();
  return result.success ? result.jobs.map(toImportJobDTO) : [];
}

export async function getImportJobById(jobId: number): Promise<ImportJobDTO | null> {
  const result = await getImportJob({ jobId });
  return result.success ? toImportJobDTO(result.job) : null;
}
