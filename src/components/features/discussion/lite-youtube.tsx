"use client";

import LiteYouTubeEmbed from "react-lite-youtube-embed";
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";

/**
 * Click-to-load YouTube facade. Renders ONLY a poster + play button until the
 * user clicks; the youtube-nocookie.com iframe is injected on click. NEVER a
 * raw user-controlled iframe (the id is validated upstream by parseYouTubeId).
 * CSP frame-src allows youtube-nocookie.com (see next.config.mjs).
 */
export function LiteYouTube({ id, title }: { id: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border max-w-md">
      <LiteYouTubeEmbed
        id={id}
        title={title}
        noCookie
        poster="hqdefault"
        wrapperClass="yt-lite rounded-lg"
      />
    </div>
  );
}
