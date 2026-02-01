"use client";

import { useState } from "react";
import { ChevronRight, Database, Table2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// =============================================================================
// Schema Definition
// =============================================================================

interface ColumnDef {
  name: string;
  type: string;
}

interface TableDef {
  name: string;
  columns: ColumnDef[];
}

/**
 * ClickHouse schema definition.
 * Hardcoded for simplicity - update when schema changes.
 */
const SCHEMA: TableDef[] = [
  {
    name: "page_views",
    columns: [
      { name: "timestamp", type: "DateTime" },
      { name: "path", type: "String" },
      { name: "session_id", type: "String" },
      { name: "user_id", type: "Nullable(String)" },
      { name: "country", type: "LowCardinality(String)" },
      { name: "device_type", type: "LowCardinality(String)" },
      { name: "is_bot", type: "UInt8" },
      { name: "referrer", type: "String" },
      { name: "user_agent", type: "String" },
    ],
  },
  {
    name: "sessions",
    columns: [
      { name: "session_id", type: "String" },
      { name: "user_id", type: "Nullable(String)" },
      { name: "start_time", type: "DateTime" },
      { name: "duration_seconds", type: "UInt32" },
      { name: "page_count", type: "UInt16" },
      { name: "country", type: "LowCardinality(String)" },
      { name: "device_type", type: "LowCardinality(String)" },
    ],
  },
  {
    name: "ai_usage",
    columns: [
      { name: "timestamp", type: "DateTime" },
      { name: "user_id", type: "Nullable(String)" },
      { name: "session_id", type: "String" },
      { name: "query_type", type: "LowCardinality(String)" },
      { name: "model", type: "LowCardinality(String)" },
      { name: "input_tokens", type: "UInt32" },
      { name: "output_tokens", type: "UInt32" },
      { name: "cost", type: "Float64" },
      { name: "response_time_ms", type: "UInt32" },
    ],
  },
  {
    name: "errors",
    columns: [
      { name: "timestamp", type: "DateTime" },
      { name: "error_type", type: "String" },
      { name: "error_source", type: "LowCardinality(String)" },
      { name: "severity", type: "LowCardinality(String)" },
      { name: "message", type: "String" },
      { name: "stack_trace", type: "String" },
      { name: "session_id", type: "Nullable(String)" },
      { name: "user_id", type: "Nullable(String)" },
      { name: "path", type: "String" },
    ],
  },
  {
    name: "performance",
    columns: [
      { name: "timestamp", type: "DateTime" },
      { name: "path", type: "String" },
      { name: "lcp", type: "Float64" },
      { name: "fcp", type: "Float64" },
      { name: "ttfb", type: "Float64" },
      { name: "cls", type: "Float64" },
      { name: "inp", type: "Float64" },
      { name: "page_type", type: "LowCardinality(String)" },
      { name: "connection_type", type: "LowCardinality(String)" },
    ],
  },
  {
    name: "lambda_invocations",
    columns: [
      { name: "timestamp", type: "DateTime" },
      { name: "function_name", type: "LowCardinality(String)" },
      { name: "duration_ms", type: "UInt32" },
      { name: "memory_used_mb", type: "UInt16" },
      { name: "status", type: "LowCardinality(String)" },
      { name: "cost", type: "Float64" },
    ],
  },
  {
    name: "system_metrics",
    columns: [
      { name: "timestamp", type: "DateTime" },
      { name: "cpu_1m", type: "Float32" },
      { name: "cpu_5m", type: "Float32" },
      { name: "cpu_15m", type: "Float32" },
      { name: "memory_heap_mb", type: "Float32" },
      { name: "memory_rss_mb", type: "Float32" },
      { name: "event_loop_lag_ms", type: "Float32" },
    ],
  },
];

// =============================================================================
// Schema Browser Component
// =============================================================================

interface SchemaBrowserProps {
  onInsertColumn?: (table: string, column: string) => void;
  className?: string;
}

export function SchemaBrowser({ onInsertColumn, className }: SchemaBrowserProps) {
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());

  const toggleTable = (tableName: string) => {
    setOpenTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        <Database className="h-3.5 w-3.5" />
        <span>Tables</span>
      </div>

      {SCHEMA.map((table) => (
        <Collapsible
          key={table.name}
          open={openTables.has(table.name)}
          onOpenChange={() => toggleTable(table.name)}
        >
          <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left text-xs py-1 px-1 rounded hover:bg-muted/50 transition-colors">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform",
                openTables.has(table.name) && "rotate-90"
              )}
            />
            <Table2 className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{table.name}</span>
            <span className="text-muted-foreground ml-auto">
              {table.columns.length}
            </span>
          </CollapsibleTrigger>

          <CollapsibleContent className="pl-5 space-y-0.5">
            {table.columns.map((column) => (
              <button
                key={column.name}
                className="flex items-center justify-between w-full text-left text-xs py-0.5 px-2 rounded hover:bg-muted/50 transition-colors group"
                onClick={() => onInsertColumn?.(table.name, column.name)}
                title={`Click to insert ${table.name}.${column.name}`}
              >
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {column.name}
                </span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  {column.type}
                </span>
              </button>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
