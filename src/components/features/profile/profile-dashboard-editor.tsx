"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { GripVertical, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateProfileLayoutAction } from "@/server/actions/profile";
import { cn } from "@/lib/utils";
import { useProfileViewer } from "./profile-viewer-context";
import { WIDGET_RENDER } from "./widgets/render";
import { ALL_WIDGET_TYPES, WIDGET_META, resolveLayout } from "./widgets/registry";
import { LAYOUT_COLS, ROW_HEIGHT, type WidgetInstance, type WidgetType } from "./widgets/types";
import type { PublicProfileDTO } from "@/types/social";
import "react-grid-layout/css/styles.css";

const newId = () => `w_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Owner-only dashboard editor (client, dynamically imported with ssr:false so
 * it never enters the ISR/RSC tree or the visitor bundle). Drag/resize/add/
 * remove widgets via react-grid-layout, then persist the layout JSON.
 */
export function ProfileDashboardEditor({ profile }: { profile: PublicProfileDTO }) {
  const router = useRouter();
  const { setEditMode } = useProfileViewer();
  const { width, containerRef, mounted } = useContainerWidth();
  const [widgets, setWidgets] = useState<WidgetInstance[]>(
    () => resolveLayout(profile.layout, profile).widgets
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const rglLayout: LayoutItem[] = widgets.map((w) => {
    const meta = WIDGET_META[w.type];
    return {
      i: w.id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      minW: meta.minSize.w,
      minH: meta.minSize.h,
      maxW: meta.maxSize?.w,
      maxH: meta.maxSize?.h,
    };
  });

  const onLayoutChange = (next: Layout) =>
    setWidgets((prev) =>
      prev.map((wd) => {
        const l = next.find((n) => n.i === wd.id);
        return l ? { ...wd, x: l.x, y: l.y, w: l.w, h: l.h } : wd;
      })
    );

  const addWidget = (type: WidgetType) => {
    const meta = WIDGET_META[type];
    setWidgets((p) => [
      ...p,
      { id: newId(), type, x: 0, y: Infinity, w: meta.defaultSize.w, h: meta.defaultSize.h },
    ]);
    setPaletteOpen(false);
  };

  const removeWidget = (id: string) => setWidgets((p) => p.filter((w) => w.id !== id));

  const save = async () => {
    setSaving(true);
    try {
      const result = await updateProfileLayoutAction({
        layout: { v: 1, cols: LAYOUT_COLS, widgets },
      });
      if (!result.ok) throw new Error(result.error);
      toast.success("Layout saved");
      setEditMode(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save layout");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-brand/40 bg-brand/[0.03] p-2 md:p-3">
      {/* Edit toolbar */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm font-semibold">Customizing your profile</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">drag the handle · resize from the corner</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setPaletteOpen(true)}>
            <Plus className="h-4 w-4" /> Add widget
          </Button>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditMode(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-9 min-w-20" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      <div ref={containerRef}>
        {mounted && (
          <Responsive
            width={width}
            layouts={{ lg: rglLayout, md: rglLayout, sm: rglLayout }}
            breakpoints={{ lg: 1024, md: 768, sm: 0 }}
            cols={{ lg: LAYOUT_COLS, md: LAYOUT_COLS, sm: 2 }}
            rowHeight={ROW_HEIGHT}
            margin={[12, 12]}
            compactor={verticalCompactor}
            dragConfig={{ enabled: true, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map((w) => {
              const meta = WIDGET_META[w.type];
              const node = WIDGET_RENDER[w.type]?.({ data: profile, config: w.config });
              return (
                <div key={w.id} className="group relative">
                  {/* drag handle + remove (pointer-events-auto over the inert content) */}
                  <button
                    type="button"
                    className="widget-drag-handle absolute left-1.5 top-1.5 z-20 flex size-7 cursor-grab items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
                    aria-label="Drag widget"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWidget(w.id)}
                    className="absolute right-1.5 top-1.5 z-20 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Remove widget"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="pointer-events-none h-full overflow-hidden rounded-xl ring-1 ring-border">
                    {node ?? (
                      <div className="flex h-full items-center justify-center rounded-xl border bg-card p-3 text-center text-xs font-medium text-muted-foreground">
                        {meta.title}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Responsive>
        )}
      </div>

      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a widget</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {ALL_WIDGET_TYPES.map((type) => {
              const meta = WIDGET_META[type];
              const available = meta.isAvailable(profile);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addWidget(type)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors hover:border-brand/50 hover:bg-brand/5",
                    !available && "opacity-60"
                  )}
                >
                  <span className="text-sm font-medium">{meta.title}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {meta.category}
                    {!available && " · no data yet"}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
