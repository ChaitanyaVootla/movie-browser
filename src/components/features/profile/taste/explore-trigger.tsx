"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMobile } from "@/hooks/use-mobile";
import { useHistoryDismiss } from "@/hooks/use-history-dismiss";
import { useAnalytics } from "@/hooks/use-analytics";
import { cn } from "@/lib/utils";

export type TasteTapPart = "cluster" | "axis_low" | "axis_high" | "mood" | "people";

/**
 * "Every number is a door" (taste v2 spec §2): a button that opens the titles
 * behind a taste element — Popover (`w-96`) on desktop, Vaul Drawer with
 * Back-to-dismiss on mobile (DESIGN.md → Dialogs vs Drawers). The body is only
 * mounted while open, so a `next/dynamic` body loads on first tap.
 * `disabled` renders the same label as a muted, inert span (aria-disabled).
 */
export function ExploreTrigger({
  label,
  ariaLabel,
  title,
  description,
  tap,
  disabled,
  className,
  children,
}: {
  label: ReactNode;
  ariaLabel?: string;
  title: string;
  description?: string;
  tap: TasteTapPart;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const isMobile = useMobile();
  const [open, setOpen] = useState(false);
  const { trackAction } = useAnalytics();
  const close = () => setOpen(false);
  useHistoryDismiss(open && isMobile, close);

  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "cursor-default opacity-60")}>
        {label}
      </span>
    );
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      trackAction({
        action: tap === "people" ? "taste_people_titles_open" : "taste_card_tap",
        metadata: { part: tap },
      });
    }
  };

  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={isMobile ? () => onOpenChange(true) : undefined}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {label}
    </button>
  );

  const header = (
    <>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="text-xs font-medium text-muted-foreground">{description}</p>}
    </>
  );

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent align="start" className="max-h-[70dvh] w-96 space-y-3 overflow-y-auto">
          <div>{header}</div>
          {open && children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      {button}
      <Drawer open={open} onOpenChange={(o) => !o && close()}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="max-h-[70dvh] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            {open && children}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
