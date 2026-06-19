"use client";

/**
 * SOCIAL SIGNAL DESIGN LAB — /design/social  (round 2: finalized direction)
 *
 * Theme-led, no color zoo. Posters get SMALL CORNER ITEMS + a BOTTOM HAIRLINE
 * BAR only. Personal state rides a dulled brand tone (`--sig`). Not wired to
 * data — real CDN posters, crafted states for coverage.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TITLES, ACCENTS, type MockTitle } from "./_lib/mock";
import type { BadgeType } from "@/lib/badges";
import { PosterCard } from "./_components/poster-card";
import { WideRow, HeroMock } from "./_components/studies";

/* Clone a real title with forced flags so every state is represented. */
function find(id: number) {
  return TITLES.find((t) => t.id === id)!;
}
function scn(base: MockTitle, o: Partial<MockTitle>, label: string, badge?: BadgeType): { t: MockTitle; label: string; badge?: BadgeType } {
  return { t: { ...base, ...o }, label, badge };
}

const STATES: { t: MockTitle; label: string; badge?: BadgeType }[] = [
  scn(find(100088), { myStars: 4.5, loved: true }, "In-progress · rated · loved"),
  scn(find(136315), { myStars: null, loved: false }, "In-progress · not rated"),
  scn(find(95396), { progress: { watched: 9, total: 9 }, watched: true, watchlisted: false, myStars: 4, loved: false }, "Completed · rated"),
  scn(find(872585), { watched: true, myStars: 5, loved: true }, "Watched movie · rated · loved"),
  scn(find(438631), { watched: true, myStars: null, loved: false }, "Watched movie · not rated"),
  scn(find(496243), { watched: false, watchlisted: true, myStars: null, loved: false }, "Watchlisted"),
  scn(find(157336), { watched: false, watchlisted: false, myStars: null, loved: false, progress: null }, "No personal state", "trending"),
];

function Section({
  overline,
  title,
  desc,
  children,
}: {
  overline: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="border-t border-foreground/10 py-12"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{overline}</p>
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      {desc && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-8">{children}</div>
    </motion.section>
  );
}

export default function SocialSignalLab() {
  const [accent, setAccent] = useState(ACCENTS.find((a) => a.key === "scarlet") ?? ACCENTS[0]);
  const [dark, setDark] = useState(true);

  return (
    <div
      className={cn(dark ? "dark" : "", "min-h-screen bg-background text-foreground")}
      style={
        {
          "--brand": accent.brand,
          "--brand-rgb": accent.rgb,
          // dulled signal tone for personal state (toned down from full brand)
          "--sig": "color-mix(in oklab, var(--brand) 78%, #8a8a8a)",
        } as React.CSSProperties
      }
    >
      {/* Sticky control bar */}
      <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <h1 className="text-base font-bold tracking-tight">Social Signal Lab</h1>
            <p className="text-[11px] text-muted-foreground">Round 2 · finalized direction · not wired to data</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Accent</span>
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAccent(a)}
                  aria-label={a.label}
                  title={a.label}
                  className={cn(
                    "h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-background transition hover:scale-110",
                    accent.key === a.key ? "ring-foreground" : "ring-transparent"
                  )}
                  style={{ background: a.brand }}
                />
              ))}
              <span className="ml-1 w-36 text-[11px] font-medium text-foreground/80">{accent.label}</span>
            </div>
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-full border border-foreground/15 px-3 py-1 text-xs font-medium"
            >
              {dark ? "Dark" : "Light"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <div className="py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Design exploration · round 2</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
            Small corners, a hairline bar, one dulled accent.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            No HUDs or rings covering the art. Top-right keeps the community score; the bottom-left corner carries
            your <span className="text-foreground">%-filled star + heart</span> (and supersedes the quality badge);
            series get a <span className="text-foreground">bottom hairline bar</span>. Flip the accent to confirm it
            holds under any theme.
          </p>
        </div>

        {/* Poster card — final, across every state */}
        <Section
          overline="Cards · everywhere a title appears"
          title="Poster card — every state"
          desc="The one finalized treatment, shown across each personal-state combination so nothing's left ambiguous. Hover a card to reveal the up-next label + un-grayscale."
        >
          <div className="flex flex-wrap gap-x-4 gap-y-7">
            {STATES.map((s, i) => (
              <div key={i} className="flex flex-col">
                <PosterCard t={s.t} qualityBadge={s.badge} />
                <span className="mt-2 max-w-[168px] text-[11px] leading-snug text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Wide card — footer line */}
        <Section
          overline="Wide cards · continue watching · recents · recommended · circles"
          title="Footer-line wide card"
          desc="Social proof (discussing · friends) sits on the image; the title moved BELOW the card like every other card, with a contextual subline (Up next · S?E?). In-progress series carry the same hairline bar."
        >
          <WideRow />
        </Section>

        {/* Hero — full bleed (breaks out of the lab's max-w container) */}
        <Section
          overline="Detail page · hero → action bar → community"
          title="Faithful hero + the Community teaser row"
          desc="Real backdrop fit (right-aligned, never cropped), real external-ratings icons, real action bar (Trailer · Watchlist · Watched/Progress · Like · Dislike · Share · Rate · Diary). Under it, two peer teaser boxes: the existing prominent Discussion box (kept), and a merged Reviews & Ratings box — same opinion axis (histogram = the quantitative signal, reviews = the written subset). Each is the entry into its tab in the full band below."
        >
          {/* full-bleed: span the viewport so the hero can be judged at true width */}
          <div className="relative left-1/2 w-screen -translate-x-1/2">
            <HeroMock bleed />
          </div>
        </Section>
      </main>
    </div>
  );
}
