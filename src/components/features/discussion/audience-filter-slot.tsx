import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Circles-readiness seam (spec §9 — DESIGN-FOR, do NOT build). An inert
 * audience/circle filter affordance. Public reads always bake circleId IS NULL;
 * this slot only reserves the layout + interaction shape for Phase 3 circles.
 * NOT WIRED — disabled and non-interactive on purpose.
 */
export function AudienceFilterSlot() {
  return (
    <div data-circles-readiness="true" className="shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        aria-disabled="true"
        className="gap-1.5 text-muted-foreground"
        title="Audience filtering (circles) is coming soon"
      >
        <Users className="size-4" />
        Everyone
      </Button>
    </div>
  );
}
