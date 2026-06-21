"use client";

// Vendored + patched fork of `next-view-transitions` (v0.3.5, MIT).
//
// WHY WE FORK IT (the "page frozen for ~4s after closing a mobile drawer" bug,
// diagnosed Jun 21 2026): the upstream `useBrowserNativeTransitions` starts a
// `document.startViewTransition()` on EVERY `popstate`, and the transition's
// update-callback promise is resolved ONLY by an effect keyed on
// `[hash, pathname]`. A popstate that does NOT change the path/hash therefore
// leaves that promise forever pending, so the browser holds its full-screen
// `::view-transition` snapshot overlay (top layer — it intercepts ALL scroll
// and taps) until its internal ~4s watchdog aborts it. The page is frozen and
// then "recovers on its own."
//
// Our `useHistoryDismiss` (mobile Back-to-close for drawers/sheets) pushes a
// SAME-PATH synthetic history entry and pops it (on Back, or via a deferred
// `history.back()` unwind on swipe/scrim close) — i.e. it fires exactly the
// same-path popstate that wedges the transition. That's why it was mobile-only
// (the synthetic entry is only pushed at <768px) and hit both the close gesture
// and the Back gesture.
//
// THE FIX is the single guard in `onPopState` below: if the popstate did not
// change the pathname, skip starting a view transition entirely (a same-path
// pop has no route morph to animate anyway). Real back/forward navigations
// (pathname changes) still get their transition. Everything else is a faithful
// copy of upstream so `Link` / `useTransitionRouter` keep sharing this context.

import NextLink, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type ViewTransitionCallback = () => void | Promise<void>;
interface ViewTransitionLike {
  ready: Promise<void>;
}
interface DocWithVT {
  startViewTransition?: (cb: ViewTransitionCallback) => ViewTransitionLike;
}

function hasViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

// --- hash tracking (unchanged from upstream) --------------------------------
function getHashSnapshot() {
  return window.location.hash;
}
function getServerHashSnapshot() {
  return "";
}
function subscribeHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}
function useHash() {
  return useSyncExternalStore(subscribeHash, getHashSnapshot, getServerHashSnapshot);
}

// --- the browser-native (popstate) transition driver ------------------------
function useBrowserNativeTransitions() {
  const pathname = usePathname();
  const currentPathname = useRef(pathname);
  const [currentViewTransition, setCurrentViewTransition] = useState<
    [Promise<void>, () => void] | null
  >(null);

  useEffect(() => {
    if (!hasViewTransitions()) return () => {};

    const onPopState = () => {
      // ---- THE FIX ----------------------------------------------------------
      // Skip the view transition when this popstate does not change the path
      // (e.g. a useHistoryDismiss overlay-dismiss entry). Starting one here
      // would never resolve (the resolve effect below is keyed on pathname/hash
      // change) and would wedge the browser's snapshot overlay for ~4s. A
      // same-path pop has no route to morph, so there is nothing to animate.
      if (window.location.pathname === currentPathname.current) return;
      // -----------------------------------------------------------------------

      let pendingViewTransitionResolve!: () => void;
      const pendingViewTransition = new Promise<void>((resolve) => {
        pendingViewTransitionResolve = resolve;
      });
      const pendingStartViewTransition = new Promise<void>((resolve) => {
        (document as DocWithVT).startViewTransition?.(() => {
          resolve();
          return pendingViewTransition;
        });
      });
      setCurrentViewTransition([pendingStartViewTransition, pendingViewTransitionResolve]);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Reading the ref during render + gating `use()` is upstream's intentional
  // pattern for blocking the new route until the transition is screenshotted.
  // eslint-disable-next-line react-hooks/refs
  if (currentViewTransition && currentPathname.current !== pathname) {
    // Block rendering the new route until the transition is started (DOM
    // screenshotted).
    use(currentViewTransition[0]);
  }

  const transitionRef = useRef(currentViewTransition);
  useEffect(() => {
    transitionRef.current = currentViewTransition;
  }, [currentViewTransition]);

  const hash = useHash();
  useEffect(() => {
    currentPathname.current = pathname;
    if (transitionRef.current) {
      transitionRef.current[1]();
      transitionRef.current = null;
    }
  }, [hash, pathname]);
}

// --- context + provider (unchanged from upstream) ---------------------------
const ViewTransitionsContext = createContext<((finish: () => void) => void) | null>(null);

export function ViewTransitions({ children }: { children: ReactNode }) {
  const [finishViewTransition, setFinishViewTransition] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (finishViewTransition) {
      finishViewTransition();
      // Upstream pattern: clear the one-shot finisher after invoking it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFinishViewTransition(null);
    }
  }, [finishViewTransition]);

  useBrowserNativeTransitions();

  return (
    <ViewTransitionsContext.Provider value={setFinishViewTransition}>
      {children}
    </ViewTransitionsContext.Provider>
  );
}

function useSetFinishViewTransition() {
  const context = use(ViewTransitionsContext);
  if (!context) {
    throw new Error("useSetFinishViewTransition must be used within a ViewTransitions component");
  }
  return context;
}

// --- transition-aware router (unchanged from upstream) ----------------------
interface TransitionOptions {
  onTransitionReady?: () => void;
  scroll?: boolean;
}

export function useTransitionRouter() {
  const router = useRouter();
  const finishViewTransition = useSetFinishViewTransition();

  const triggerTransition = useCallback(
    (cb: () => void, { onTransitionReady }: { onTransitionReady?: () => void } = {}) => {
      if (hasViewTransitions()) {
        const transition = (document as DocWithVT).startViewTransition?.(
          () =>
            new Promise<void>((resolve) => {
              startTransition(() => {
                cb();
                finishViewTransition(() => resolve());
              });
            })
        );
        if (onTransitionReady && transition) {
          transition.ready.then(onTransitionReady);
        }
      } else {
        return cb();
      }
    },
    [finishViewTransition]
  );

  const push = useCallback(
    (href: string, { onTransitionReady, ...options }: TransitionOptions = {}) => {
      triggerTransition(() => router.push(href, options), { onTransitionReady });
    },
    [triggerTransition, router]
  );

  const replace = useCallback(
    (href: string, { onTransitionReady, ...options }: TransitionOptions = {}) => {
      triggerTransition(() => router.replace(href, options), { onTransitionReady });
    },
    [triggerTransition, router]
  );

  return useMemo(() => ({ ...router, push, replace }), [push, replace, router]);
}

// --- Link (unchanged from upstream) -----------------------------------------
function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  const eventTarget = event.currentTarget;
  const target = eventTarget.getAttribute("target");
  return (
    (target && target !== "_self") ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button === 1 // middle-click (opens in new tab) — let the browser handle it
  );
}

function shouldPreserveDefault(e: MouseEvent<HTMLAnchorElement>) {
  const { nodeName } = e.currentTarget;
  const isAnchorNodeName = nodeName.toUpperCase() === "A";
  return isAnchorNodeName && isModifiedEvent(e);
}

type VTLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { children?: ReactNode };

export function Link(props: VTLinkProps) {
  const router = useTransitionRouter();
  const { href, as, replace, scroll } = props;

  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (props.onClick) props.onClick(e);
      if (e.defaultPrevented) return;
      if (hasViewTransitions()) {
        if (shouldPreserveDefault(e)) return;
        e.preventDefault();
        const navigate = replace ? router.replace : router.push;
        navigate(String(as || href), { scroll: scroll != null ? scroll : true });
      }
    },
    [props, href, as, replace, scroll, router]
  );

  return <NextLink {...props} onClick={onClick} />;
}
