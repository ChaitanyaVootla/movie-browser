import type { CSSProperties } from "react";
import { resolveLayout, WIDGET_META } from "./widgets/registry";
import { WIDGET_RENDER } from "./widgets/render";
import type { PublicProfileDTO } from "@/types/social";

/**
 * Static, server-rendered widget grid for the PUBLIC profile (cacheable, SEO,
 * zero JS). Reads the saved layout (or a generated default) and places each
 * widget by explicit grid column; rows flow to natural content height
 * (`.dash-grid` in globals.css). The owner edit mode (react-grid-layout,
 * client-only) renders the same widgets interactively — see
 * profile-dashboard-editor.
 */
export function ProfileDashboard({ profile }: { profile: PublicProfileDTO }) {
  const layout = resolveLayout(profile.layout, profile);
  const widgets = [...layout.widgets].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <div className="dash-grid" style={{ "--cols": layout.cols } as CSSProperties}>
      {widgets.map((wi) => {
        const render = WIDGET_RENDER[wi.type];
        const node = render?.({ data: profile, config: wi.config });
        if (!node) return null; // empty widget → omit on the public view
        const meta = WIDGET_META[wi.type];
        return (
          <div
            key={wi.id}
            className="dash-item"
            style={
              {
                "--d-x": wi.x + 1,
                "--d-w": wi.w,
                "--m-span": meta.mobileSpan,
              } as CSSProperties
            }
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}
