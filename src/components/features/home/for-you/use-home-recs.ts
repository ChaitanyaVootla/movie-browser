"use client";

/**
 * State for the home For-you island (taste v2 spec 2026-10-12 §3.4–§3.8):
 * fetch + tune tokens (mirrored to `?tune=` by TuneUrlSync), optimistic
 * dismiss / undo, seeded "More like this" rows, Surprise me, and the
 * `recs-tune` window event from Cue's `[TUNE:…]` pill.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAnalytics } from "@/hooks/use-analytics";
import { getHomeRecs, getMoreLikeThis } from "@/server/actions/taste-recs";
import { recordRecFeedback, undoRecFeedback } from "@/server/actions/rec-feedback";
import { isStaleServerActionError, recoverFromStaleAction } from "@/lib/stale-action";
import { tokensToTune, tuneToTokens, type AllowedTuneSets } from "@/lib/taste/tune-tokens";
import { TUNE_TOKEN_PREFIX, type HomeRecsDTO, type RecItemDTO, type RecRowDTO } from "@/lib/taste/recommend-types";
import { RECS_TUNE_EVENT, type RecsTuneDetail } from "@/components/features/ai/types";
import { useTasteUiStore } from "@/stores/taste-ui";
import { refKey } from "./rec-copy";

/** Max seeded rows at once (oldest replaced). */
export const MAX_SEED_ROWS = 2;
/** Because / seed rows hide below this many items. */
export const MIN_ROW_ITEMS = 4;
const SKELETON_AFTER_MS = 300;

function allowedFrom(recs: HomeRecsDTO | null): AllowedTuneSets | null {
  if (!recs || recs.tuneChips.length === 0) return null;
  const pick = (prefix: string) =>
    new Set(recs.tuneChips.filter((c) => c.token.startsWith(prefix)).map((c) => c.token.slice(prefix.length)));
  return {
    genres: pick(TUNE_TOKEN_PREFIX.genre),
    languages: pick(TUNE_TOKEN_PREFIX.language),
    moods: pick(TUNE_TOKEN_PREFIX.mood),
  };
}

/** Normalise raw tokens (URL / chat / chips) — unknown dropped, single-selects resolved. */
export function normalizeTokens(raw: readonly string[], allowed: AllowedTuneSets | null): string[] {
  return tuneToTokens(tokensToTune(raw, allowed ?? {}));
}

function errorRecs(): HomeRecsDTO {
  return { rows: [], reason: "error", algo: 0, tuneAvailable: {}, tuneChips: [], positiveCount: 0 };
}

export function useHomeRecs(enabled: boolean) {
  const { trackAction } = useAnalytics();
  const setTaste = useTasteUiStore((s) => s.setTaste);
  const [recs, setRecs] = useState<HomeRecsDTO | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [urlReady, setUrlReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [seeded, setSeeded] = useState<Array<{ after: string; row: RecRowDTO }>>([]);
  const reqId = useRef(0);
  const pendingCueTokens = useRef<string[] | null>(null);
  const allowed = useMemo(() => allowedFrom(recs), [recs]);
  const allowedRef = useRef(allowed);
  useEffect(() => {
    allowedRef.current = allowed;
  }, [allowed]);

  const load = useCallback(
    (nextTokens: readonly string[], opts: { shuffle?: number; exclude?: string[] } = {}) => {
      const id = ++reqId.current;
      setPending(true);
      const timer = setTimeout(() => {
        if (reqId.current === id) setShowSkeleton(true);
      }, SKELETON_AFTER_MS);
      const tune = tokensToTune(nextTokens, allowedRef.current ?? {});
      getHomeRecs({ tune, shuffle: opts.shuffle, exclude: opts.exclude })
        .then((data) => {
          if (reqId.current !== id) return;
          setRecs(data);
          setTaste({ hasProfile: data.reason === "ok" || data.reason === "no_index", reason: data.reason });
        })
        .catch((error: unknown) => {
          if (isStaleServerActionError(error)) {
            recoverFromStaleAction();
            return;
          }
          if (reqId.current === id) setRecs((prev) => prev ?? errorRecs());
        })
        .finally(() => {
          clearTimeout(timer);
          if (reqId.current === id) {
            setPending(false);
            setShowSkeleton(false);
          }
        });
    },
    [setTaste]
  );

  // First load waits for the URL sync, so `/?tune=series` paints tuned at once.
  useEffect(() => {
    if (enabled && urlReady) load(tokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tune changes go through applyTokens
  }, [enabled, urlReady, load]);

  /** Apply a token set (chip press, URL Back, Cue) — one fetch, analytics by source. */
  const applyTokens = useCallback(
    (raw: readonly string[], source: "chip" | "url" | "cue" | "reset") => {
      const next = normalizeTokens(raw, allowedRef.current);
      setTokens(next);
      if (source === "cue") trackAction({ action: "cue_tune_applied", metadata: { tokens: next } });
      else if (source !== "url") trackAction({ action: "rec_tune", metadata: { tokens: next } });
      load(next);
    },
    [load, trackAction]
  );

  const onUrlTokens = useCallback(
    (raw: string[]) => {
      if (!urlReady) {
        setTokens(normalizeTokens(raw, null));
        setUrlReady(true);
        return;
      }
      applyTokens(raw, "url");
    },
    [urlReady, applyTokens]
  );

  // Tokens from the URL before chips were known: re-validate once they are.
  useEffect(() => {
    if (!allowed) return;
    const cue = pendingCueTokens.current;
    if (cue) {
      pendingCueTokens.current = null;
      applyTokens(cue, "cue");
      return;
    }
    setTokens((cur) => {
      const valid = normalizeTokens(cur, allowed);
      return valid.length === cur.length ? cur : valid;
    });
  }, [allowed, applyTokens]);

  // Cue's [TUNE:…] pill → apply as chip presses; scroll the row into view.
  useEffect(() => {
    if (!enabled) return;
    const onTune = (e: Event) => {
      const detail = (e as CustomEvent<RecsTuneDetail>).detail;
      if (!detail || !Array.isArray(detail.tokens)) return;
      const raw = detail.tokens.filter((t): t is string => typeof t === "string");
      if (!allowedRef.current) {
        pendingCueTokens.current = raw;
        return;
      }
      applyTokens(raw, "cue");
      const el = document.getElementById("for-you");
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener(RECS_TUNE_EVENT, onTune);
    return () => window.removeEventListener(RECS_TUNE_EVENT, onTune);
  }, [enabled, applyTokens]);

  const toggleToken = useCallback(
    (token: string) => {
      const on = tokens.includes(token);
      applyTokens(on ? tokens.filter((t) => t !== token) : [...tokens, token], "chip");
    },
    [tokens, applyTokens]
  );

  const resetTune = useCallback(() => applyTokens([], "reset"), [applyTokens]);

  const surprise = useCallback(() => {
    const shown = recs?.rows.find((r) => r.kind === "for_you")?.items.map(refKey) ?? [];
    const nonce = Math.floor(Math.random() * 2 ** 30);
    trackAction({ action: "rec_shuffle", metadata: { tokens } });
    load(tokens, { shuffle: nonce, exclude: shown.slice(0, 40) });
  }, [recs, tokens, load, trackAction]);

  const reload = useCallback(() => load(tokens), [load, tokens]);

  const undo = useCallback(
    (it: RecItemDTO) => {
      const key = refKey(it);
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      trackAction({ action: "rec_undo", mediaType: it.mediaType, itemId: it.id, itemTitle: it.title });
      void undoRecFeedback({ mediaType: it.mediaType, id: it.id, kind: "DISMISS" }).catch(() => undefined);
    },
    [trackAction]
  );

  const dismiss = useCallback(
    (it: RecItemDTO, row: RecRowDTO) => {
      const key = refKey(it);
      setHidden((prev) => new Set(prev).add(key));
      const anchorKey = it.explanation?.kind === "because" ? refKey(it.explanation.anchor) : undefined;
      trackAction({
        action: "rec_dismiss",
        mediaType: it.mediaType,
        itemId: it.id,
        itemTitle: it.title,
        metadata: { row: row.id, anchor: anchorKey ?? null },
      });
      const restore = () =>
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      recordRecFeedback({ mediaType: it.mediaType, id: it.id, kind: "DISMISS", rowId: row.id, anchorKey })
        .then((res) => {
          if (res.ok) {
            toast("Removed from your picks", { duration: 8000, action: { label: "Undo", onClick: () => undo(it) } });
          } else {
            restore();
            toast.error("That pick could not be removed. Try again.");
          }
        })
        .catch(() => {
          restore();
          toast.error("That pick could not be removed. Try again.");
        });
    },
    [trackAction, undo]
  );

  const moreLikeThis = useCallback(
    (it: RecItemDTO, row: RecRowDTO) => {
      trackAction({
        action: "rec_more_like_this",
        mediaType: it.mediaType,
        itemId: it.id,
        itemTitle: it.title,
        metadata: { row: row.id },
      });
      getMoreLikeThis({ mediaType: it.mediaType, id: it.id })
        .then((seedRow) => {
          if (!seedRow) {
            toast("No close matches for that title yet.");
            return;
          }
          setSeeded((prev) => {
            const rest = prev.filter((s) => s.row.id !== seedRow.id);
            const next = [...rest, { after: row.id, row: seedRow }];
            return next.slice(-MAX_SEED_ROWS);
          });
        })
        .catch(() => toast.error("Similar titles could not load. Try again."));
    },
    [trackAction]
  );

  const removeSeed = useCallback(
    (rowId: string) => {
      setSeeded((prev) => prev.filter((s) => s.row.id !== rowId));
      trackAction({ action: "rec_seed_row_remove", metadata: { row: rowId } });
    },
    [trackAction]
  );

  /** Server rows with dismissals applied and seeded rows inserted under their source row. */
  const rows = useMemo(() => {
    if (!recs) return [];
    const visible = (r: RecRowDTO): RecRowDTO => ({ ...r, items: r.items.filter((it) => !hidden.has(refKey(it))) });
    const out: RecRowDTO[] = [];
    const place = (afterId: string) => {
      for (const s of seeded) {
        if (s.after !== afterId) continue;
        out.push(visible(s.row));
        place(s.row.id);
      }
    };
    for (const r of recs.rows) {
      out.push(visible(r));
      place(r.id);
    }
    // Seeds whose source row disappeared (re-tune) go to the end.
    for (const s of seeded) if (!out.some((r) => r.id === s.row.id)) out.push(visible(s.row));
    return out.filter((r) => r.kind === "for_you" || r.items.length >= MIN_ROW_ITEMS);
  }, [recs, hidden, seeded]);

  return {
    recs,
    rows,
    tokens,
    pending,
    showSkeleton,
    urlReady,
    actions: { applyTokens, toggleToken, resetTune, surprise, reload, dismiss, undo, moreLikeThis, removeSeed, onUrlTokens },
  };
}
