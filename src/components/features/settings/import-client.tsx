"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAnalytics } from "@/hooks/use-analytics";
import { getImportJobById, getImportJobs, startImportAction } from "@/server/actions/imports";
import type { ImportJobDTO, ImportSource } from "@/types/social";

const SOURCES: { value: ImportSource; label: string; hint: string }[] = [
  { value: "LETTERBOXD", label: "Letterboxd", hint: "Settings → Data → Export (zip)" },
  { value: "TRAKT", label: "Trakt", hint: "Settings → Data → Export" },
  { value: "IMDB", label: "IMDb", hint: "Your Ratings → Export (csv)" },
];

const POLL_MS = 2500;

function JobReport({ job }: { job: ImportJobDTO }) {
  if (!job.stats) return null;
  const { rowsTotal, imported, skipped, errors } = job.stats;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-semibold">{imported.toLocaleString()}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Imported
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-semibold">{skipped.toLocaleString()}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Skipped
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-semibold">{errors.length.toLocaleString()}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Errors
          </p>
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        {rowsTotal.toLocaleString()} rows total. Nothing is dropped silently — skips and
        errors are listed below.
      </p>
      {errors.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {errors.slice(0, 200).map((error) => (
                <tr key={`${error.row}-${error.reason}`}>
                  <td className="px-3 py-1.5 tabular-nums">{error.row}</td>
                  <td className="px-3 py-1.5">{error.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ImportClient() {
  const [source, setSource] = useState<ImportSource>("LETTERBOXD");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<ImportJobDTO[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { trackAction } = useAnalytics();

  useEffect(() => {
    getImportJobs().then(setJobs).catch(() => undefined);
  }, []);

  // Poll the newest active job until terminal
  const activeJob = jobs.find((j) => j.status === "PENDING" || j.status === "RUNNING");
  useEffect(() => {
    if (!activeJob) return;
    const timer = setInterval(() => {
      getImportJobById(activeJob.id)
        .then((updated) => {
          if (updated) {
            setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeJob]);

  const handleStart = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose your export file first");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("source", source);
      formData.set("file", file);
      const result = await startImportAction(formData);
      if (result.ok) {
        toast.success("Import started — you can leave this page");
        trackAction({ action: "import_start", metadata: { source, fileSize: file.size } });
        const job = await getImportJobById(result.jobId);
        if (job) setJobs((prev) => [job, ...prev]);
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const sourceHint = SOURCES.find((s) => s.value === source)?.hint;

  return (
    <div className="space-y-8">
      <div className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceHint && (
              <p className="text-xs font-medium text-muted-foreground">{sourceHint}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Export file (.csv or .zip)</Label>
            <Input id="import-file" ref={fileRef} type="file" accept=".csv,.zip" className="h-10" />
          </div>
        </div>
        <Button className="h-10 gap-1.5" disabled={busy} onClick={() => void handleStart()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Start import
        </Button>
      </div>

      {jobs.length > 0 && (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                {job.status === "COMPLETED" ? (
                  <CircleCheck className="h-4 w-4 text-brand" />
                ) : job.status === "FAILED" ? (
                  <CircleX className="h-4 w-4 text-destructive" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <p className="text-sm font-medium">
                  {SOURCES.find((s) => s.value === job.source)?.label ?? job.source} import
                </p>
                <p className="ml-auto text-xs font-medium text-muted-foreground">
                  {new Date(job.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              {(job.status === "PENDING" || job.status === "RUNNING") && job.stats && (
                <Progress
                  value={
                    job.stats.rowsTotal > 0
                      ? Math.round((job.stats.processed / job.stats.rowsTotal) * 100)
                      : 0
                  }
                />
              )}
              {job.status === "COMPLETED" && <JobReport job={job} />}
              {job.status === "FAILED" && (
                <p className="text-xs font-medium text-destructive">
                  Import failed — your file is kept; retry or contact support.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
