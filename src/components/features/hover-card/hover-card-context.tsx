"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { HoverCardData } from "@/server/actions/hover-card";
import type { MovieListItem, SeriesListItem } from "@/types";

interface HoverCardState {
  isOpen: boolean;
  item: MovieListItem | SeriesListItem | null;
  data: HoverCardData | null;
  bounds: DOMRect | null;
  isLoading: boolean;
}

interface HoverCardContextValue {
  state: HoverCardState;
  openHoverCard: (
    item: MovieListItem | SeriesListItem,
    bounds: DOMRect
  ) => void;
  closeHoverCard: () => void;
  setHoverCardData: (data: HoverCardData) => void;
  setLoading: (loading: boolean) => void;
  keepOpen: () => void;
  startClose: () => void;
}

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

export function useHoverCardContext() {
  const context = useContext(HoverCardContext);
  if (!context) {
    // Return a noop context if provider is missing (can happen during HMR)
    return {
      state: {
        isOpen: false,
        item: null,
        data: null,
        bounds: null,
        isLoading: false,
      },
      openHoverCard: () => {},
      closeHoverCard: () => {},
      setHoverCardData: () => {},
      setLoading: () => {},
      keepOpen: () => {},
      startClose: () => {},
    };
  }
  return context;
}

interface HoverCardProviderProps {
  children: ReactNode;
}

export function HoverCardProvider({ children }: HoverCardProviderProps) {
  const [state, setState] = useState<HoverCardState>({
    isOpen: false,
    item: null,
    data: null,
    bounds: null,
    isLoading: false,
  });

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openHoverCard = useCallback(
    (item: MovieListItem | SeriesListItem, bounds: DOMRect) => {
      clearCloseTimeout();
      setState({
        isOpen: true,
        item,
        data: null,
        bounds,
        isLoading: true,
      });
    },
    [clearCloseTimeout]
  );

  const closeHoverCard = useCallback(() => {
    clearCloseTimeout();
    setState({
      isOpen: false,
      item: null,
      data: null,
      bounds: null,
      isLoading: false,
    });
  }, [clearCloseTimeout]);

  const setHoverCardData = useCallback((data: HoverCardData) => {
    setState((prev) => ({
      ...prev,
      data,
      isLoading: false,
    }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading: loading,
    }));
  }, []);

  const keepOpen = useCallback(() => {
    clearCloseTimeout();
  }, [clearCloseTimeout]);

  const startClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      closeHoverCard();
    }, 150); // Small delay to allow moving mouse to hover card
  }, [clearCloseTimeout, closeHoverCard]);

  return (
    <HoverCardContext.Provider
      value={{
        state,
        openHoverCard,
        closeHoverCard,
        setHoverCardData,
        setLoading,
        keepOpen,
        startClose,
      }}
    >
      {children}
    </HoverCardContext.Provider>
  );
}

