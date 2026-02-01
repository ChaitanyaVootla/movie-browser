"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface ResultsTableProps {
  data: Record<string, unknown>[];
  className?: string;
}

// =============================================================================
// Value Formatters
// =============================================================================

/**
 * Format a cell value for display.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    // Format large numbers with commas
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return value.toLocaleString();
    }
    // Format decimals to reasonable precision
    if (!Number.isInteger(value)) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return String(value);
  }

  if (typeof value === "string") {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          // If it has time component
          if (value.includes("T") || value.includes(" ")) {
            return date.toLocaleString();
          }
          return date.toLocaleDateString();
        }
      } catch {
        // Not a valid date, return as-is
      }
    }
    return value;
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }

  return String(value);
}

/**
 * Get CSS class for a cell based on value type.
 */
function getValueClass(value: unknown): string {
  if (value === null || value === undefined) {
    return "text-muted-foreground/50 italic";
  }

  if (typeof value === "number") {
    return "font-mono tabular-nums text-right";
  }

  if (typeof value === "boolean") {
    return value ? "text-green-500" : "text-red-500";
  }

  return "";
}

// =============================================================================
// Results Table Component
// =============================================================================

export function ResultsTable({ data, className }: ResultsTableProps) {
  // Extract columns from first row
  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No results
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto border rounded-lg", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map((column) => (
              <TableHead
                key={column}
                className="font-medium text-xs whitespace-nowrap px-3 py-2"
              >
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => (
            <TableRow key={rowIndex} className="hover:bg-muted/30">
              {columns.map((column) => {
                const value = row[column];
                return (
                  <TableCell
                    key={column}
                    className={cn(
                      "text-xs px-3 py-1.5 max-w-[300px] truncate",
                      getValueClass(value)
                    )}
                    title={formatValue(value)}
                  >
                    {formatValue(value)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
