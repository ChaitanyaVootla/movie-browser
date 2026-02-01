"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Download, Loader2, AlertCircle, Clock, Rows3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResultsTable } from "../query/results-table";
import { SchemaBrowser } from "../query/schema-browser";
import { SavedQueries } from "../query/saved-queries";

// =============================================================================
// Types
// =============================================================================

interface QueryResult {
  data: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated?: boolean;
}

interface QueryError {
  error: string;
  details?: unknown;
}

// =============================================================================
// Query Tab Component
// =============================================================================

const DEFAULT_QUERY = `SELECT
  toDate(timestamp) AS date,
  count() AS views,
  countIf(is_bot = 0) AS human_views
FROM page_views
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date DESC`;

export function QueryTab() {
  const [sql, setSql] = useState(DEFAULT_QUERY);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Execute query function - defined before useEffect that uses it
  const executeQuery = useCallback(async () => {
    if (!sql.trim() || isExecuting) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sql.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as QueryError;
        throw new Error(errorData.error || "Query failed");
      }

      setResult(data as QueryResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsExecuting(false);
    }
  }, [sql, isExecuting]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to run query
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isExecuting && sql.trim()) {
          executeQuery();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sql, isExecuting, executeQuery]);

  // Insert column reference at cursor
  const handleInsertColumn = useCallback((table: string, column: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = `${table}.${column}`;

    setSql((prev) => prev.slice(0, start) + text + prev.slice(end));

    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, []);

  // Load saved query
  const handleSelectQuery = useCallback((querySql: string) => {
    setSql(querySql);
    setResult(null);
    setError(null);
  }, []);

  // Export results to CSV
  const exportToCsv = useCallback(() => {
    if (!result?.data.length) return;

    const columns = Object.keys(result.data[0]);
    const csvRows: string[] = [];

    // Header row
    csvRows.push(columns.join(","));

    // Data rows
    for (const row of result.data) {
      const values = columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvRows.push(values.join(","));
    }

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `query-results-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      {/* Main Query Area */}
      <div className="space-y-4">
        {/* Query Editor */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">SQL Query</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  {typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
                    ? "Cmd"
                    : "Ctrl"}
                  +Enter to run
                </span>
                <Button
                  size="sm"
                  onClick={executeQuery}
                  disabled={isExecuting || !sql.trim()}
                  className="h-7 px-3 text-xs"
                >
                  {isExecuting ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  ) : (
                    <Play className="h-3 w-3 mr-1.5" />
                  )}
                  Run Query
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSql(e.target.value)}
              placeholder="Enter your SQL query..."
              className={cn(
                "w-full font-mono text-xs min-h-[200px] resize-y p-3 rounded-md",
                "bg-zinc-950 border border-zinc-800 text-zinc-100",
                "placeholder:text-zinc-500",
                "focus:outline-none focus:ring-1 focus:ring-zinc-600"
              )}
              spellCheck={false}
            />
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-3 rounded-md bg-red-950/50 border border-red-900/50 text-red-200">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-4">
                  <span>Results</span>
                  <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Rows3 className="h-3 w-3" />
                      {result.rowCount.toLocaleString()} rows
                      {result.truncated && " (truncated)"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {result.executionTimeMs}ms
                    </span>
                  </div>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCsv}
                  disabled={!result.data.length}
                  className="h-7 px-3 text-xs"
                >
                  <Download className="h-3 w-3 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResultsTable data={result.data} className="max-h-[500px]" />
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!result && !error && !isExecuting && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Play className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">Run a query to see results</p>
            <p className="text-xs mt-1">Select a saved query or write your own</p>
          </div>
        )}

        {/* Loading State */}
        {isExecuting && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mb-3 animate-spin" />
            <p className="text-sm">Executing query...</p>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Saved Queries */}
        <Card>
          <CardContent className="pt-4">
            <SavedQueries onSelectQuery={handleSelectQuery} />
          </CardContent>
        </Card>

        {/* Schema Browser */}
        <Card>
          <CardContent className="pt-4">
            <SchemaBrowser onInsertColumn={handleInsertColumn} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
