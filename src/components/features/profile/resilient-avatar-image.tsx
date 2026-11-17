"use client";

import { useState, type ComponentProps } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import {
  imageHostsBlocked,
  markImageHostsBlocked,
  sameOriginImageUrl,
} from "@/lib/tmdb-img/path";

type Props = Omit<ComponentProps<typeof AvatarImage>, "src"> & { src: string };

/**
 * AvatarImage that retries through our same-origin image mirror
 * (`/g-avatar`, `/tmdb-img`) when the third-party host is unreachable.
 *
 * Radix preloads the avatar with a detached `new Image()` and only mounts the
 * <img> after it loads, so the inline <head> fallback script never sees the
 * error. This handles it here instead. Nothing renders until the image loads,
 * so picking the proxied URL up front on a known-blocked network causes no
 * hydration mismatch.
 */
export function ResilientAvatarImage({ src, onLoadingStatusChange, ...rest }: Props) {
  const proxied = sameOriginImageUrl(src);
  const [useProxy, setUseProxy] = useState(
    () => proxied !== null && typeof window !== "undefined" && imageHostsBlocked(),
  );
  const current = useProxy && proxied ? proxied : src;

  return (
    <AvatarImage
      {...rest}
      src={current}
      onLoadingStatusChange={(status) => {
        if (status === "error" && !useProxy && proxied) setUseProxy(true);
        else if (status === "loaded" && useProxy) markImageHostsBlocked();
        onLoadingStatusChange?.(status);
      }}
    />
  );
}
