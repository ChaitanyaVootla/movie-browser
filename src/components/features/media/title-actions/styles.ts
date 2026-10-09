/**
 * Shared class recipes for the compact TitleActions variant (hover preview +
 * mobile quick-info drawer). DESIGN.md → "Hover preview & title actions".
 *
 * Compact buttons sit on the themed popover surface (not imagery), so they use
 * semantic tokens. Active = brand tint (the same "on" recipe as the Rate
 * panel's toggles). The hero variant keeps its over-imagery white recipes in
 * the individual components.
 */
export const COMPACT_BTN =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const COMPACT_IDLE = "border-border bg-muted/50 text-foreground hover:bg-muted";
export const COMPACT_ACTIVE = "border-brand/60 bg-brand/15 text-brand hover:bg-brand/25";
