import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SECTION_HEADING } from "@/lib/design";

interface SectionHeadingProps {
  children: ReactNode;
  /** Optional leading icon or emoji. */
  icon?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}

/**
 * Canonical section heading (DESIGN.md headline-md). Use for every carousel,
 * grid, and page-section title.
 */
export function SectionHeading({ children, icon, as: Tag = "h2", className }: SectionHeadingProps) {
  return (
    <Tag className={cn(SECTION_HEADING, icon != null && "flex items-center gap-2", className)}>
      {icon}
      {children}
    </Tag>
  );
}
