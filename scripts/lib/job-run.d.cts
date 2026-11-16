export type JobRunStatus = "ok" | "error" | "skipped";

export interface JobRunResult {
  status?: JobRunStatus;
  /** Row counts by kind. Every key except unchanged/skipped/scanned/matched/selected/read/total/keys counts as written. */
  rows?: Record<string, number>;
  error?: unknown;
  extra?: Record<string, unknown>;
}

export interface JobRunRecord {
  level: number;
  time: string;
  event: "job_run_summary";
  job: string;
  status: JobRunStatus;
  startedAt: string;
  durationMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  maxRssMb: number;
  rows: Record<string, number>;
  rowsWritten: number;
  error?: string;
  extra?: Record<string, unknown>;
}

export interface JobRun {
  finish(result?: JobRunResult): JobRunRecord | null;
}

export function startJobRun(
  job: string,
  opts?: { env?: Record<string, string | undefined>; now?: () => number }
): JobRun;

export function buildJobRunRecord(p: {
  job: string;
  startedAt: number;
  endedAt: number;
  cpu: { user: number; system: number };
  maxRssBytes: number;
  result?: JobRunResult;
}): JobRunRecord;

export function sumWritten(rows?: Record<string, number>): number;
export function metricsDir(env?: Record<string, string | undefined>): string | null;
export function jobRunsFile(dir: string, date: Date): string;
