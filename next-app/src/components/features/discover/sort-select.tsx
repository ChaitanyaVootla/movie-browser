"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SORT_OPTIONS, TV_SORT_OPTIONS } from "@/lib/discover";
import { cn } from "@/lib/utils";

interface SortSelectProps {
  value: string;
  onChange: (value: string) => void;
  mediaType?: "movie" | "tv";
  className?: string;
}

export function SortSelect({
  value,
  onChange,
  mediaType = "movie",
  className,
}: SortSelectProps) {
  const options = mediaType === "tv" ? TV_SORT_OPTIONS : SORT_OPTIONS;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-[180px]", className)}>
        <SelectValue placeholder="Sort by" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

