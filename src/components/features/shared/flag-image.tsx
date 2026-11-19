"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { flagUrl } from "@/lib/flags";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { code: string | null | undefined };

/**
 * Country flag served from our own origin (`/images/flags`). Renders nothing for
 * codes we have no flag for (TMDB still uses retired codes such as SU / YU / XC),
 * instead of a broken-image icon.
 */
export function FlagImage({ code, alt, ...rest }: Props) {
  const src = flagUrl(code);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...rest} src={src} alt={alt ?? ""} onError={() => setFailed(true)} />
  );
}
