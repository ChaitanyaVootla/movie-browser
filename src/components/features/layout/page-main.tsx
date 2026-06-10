import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PAGE_SHELL } from "@/lib/design";

interface PageMainProps {
  children: ReactNode;
  className?: string;
}

/**
 * Canonical shell for non-hero pages (DESIGN.md Layout). Renders a div because
 * the root layout already provides the semantic <main>.
 */
export function PageMain({ children, className }: PageMainProps) {
  return <div className={cn(PAGE_SHELL, className)}>{children}</div>;
}
