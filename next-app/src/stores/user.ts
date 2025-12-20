import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

// =============================================================================
// Types
// =============================================================================

export type MediaType = "movie" | "series";

export interface UserRating {
  itemId: number;
  itemType: MediaType;
  rating: number; // -1 = dislike, 0 = neutral, 1 = like
}

export interface RecentItem {
  id: number;
  itemId: number;
  isMovie: boolean;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  viewedAt: Date | string;
}

export interface ContinueWatchingItem {
  id: number;
  itemId: number;
  isMovie: boolean;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  watchLink: string;
  watchProviderName?: string;
  updatedAt: Date | string;
}

interface UserLibraryState {
  // IDs only - for quick lookups
  watchedMovies: Set<number>;
  watchlistMovies: Set<number>;
  watchlistSeries: Set<number>;
  ratings: Map<string, number>; // "movie:123" -> rating

  // Recent items (synced with server)
  recents: RecentItem[];

  // Continue watching items (synced with server)
  continueWatching: ContinueWatchingItem[];

  // User preferences (client-side only)
  countryOverride: string | null; // User-selected country override (null = use server-detected)

  // State management
  isHydrated: boolean;
  isHydrating: boolean;
  lastHydratedAt: number | null;
}

interface UserLibraryActions {
  // Watched movies
  isWatched: (id: number) => boolean;
  toggleWatched: (id: number) => Promise<void>;

  // Watchlist
  isInWatchlist: (id: number, mediaType: MediaType) => boolean;
  toggleWatchlist: (id: number, mediaType: MediaType) => Promise<void>;

  // Ratings
  getRating: (id: number, mediaType: MediaType) => number;
  setRating: (id: number, mediaType: MediaType, rating: number) => Promise<void>;
  clearRating: (id: number, mediaType: MediaType) => Promise<void>;

  // Recents (synced with server)
  addToRecents: (item: Omit<RecentItem, "id" | "viewedAt">) => Promise<void>;

  // Continue Watching (synced with server)
  addToContinueWatching: (item: Omit<ContinueWatchingItem, "id" | "updatedAt">) => Promise<void>;
  removeFromContinueWatching: (itemId: number, isMovie: boolean) => Promise<void>;

  // Country preference
  setCountryOverride: (countryCode: string | null) => void;

  // Hydration
  hydrate: () => Promise<void>;
  reset: () => void;

  // Bulk setters (for hydration)
  setLibraryData: (data: {
    watchedMovies?: number[];
    watchlistMovies?: number[];
    watchlistSeries?: number[];
    ratings?: { itemId: number; itemType: MediaType; rating: number }[];
    recents?: RecentItem[];
    continueWatching?: ContinueWatchingItem[];
  }) => void;
}

type UserStore = UserLibraryState & UserLibraryActions;

// =============================================================================
// Helpers
// =============================================================================

function getRatingKey(id: number, mediaType: MediaType): string {
  return `${mediaType}:${id}`;
}

// =============================================================================
// Store
// =============================================================================

const initialState: UserLibraryState = {
  watchedMovies: new Set(),
  watchlistMovies: new Set(),
  watchlistSeries: new Set(),
  ratings: new Map(),
  recents: [],
  continueWatching: [],
  countryOverride: null,
  isHydrated: false,
  isHydrating: false,
  lastHydratedAt: null,
};

export const useUserStore = create<UserStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        // =====================================================================
        // Watched Movies
        // =====================================================================

        isWatched: (id) => get().watchedMovies.has(id),

        toggleWatched: async (id) => {
          const isCurrentlyWatched = get().isWatched(id);

          // Optimistic update
          set((state) => {
            const newSet = new Set(state.watchedMovies);
            if (isCurrentlyWatched) {
              newSet.delete(id);
            } else {
              newSet.add(id);
            }
            return { watchedMovies: newSet };
          });

          // Server sync
          try {
            const response = await fetch(`/api/user/movie/${id}/watched`, {
              method: isCurrentlyWatched ? "DELETE" : "POST",
            });

            if (!response.ok) {
              throw new Error("Failed to sync");
            }
          } catch (error) {
            // Revert on error
            set((state) => {
              const newSet = new Set(state.watchedMovies);
              if (isCurrentlyWatched) {
                newSet.add(id);
              } else {
                newSet.delete(id);
              }
              return { watchedMovies: newSet };
            });
            console.error("Failed to sync watched status:", error);
            throw error;
          }
        },

        // =====================================================================
        // Watchlist
        // =====================================================================

        isInWatchlist: (id, mediaType) => {
          if (mediaType === "movie") {
            return get().watchlistMovies.has(id);
          }
          return get().watchlistSeries.has(id);
        },

        toggleWatchlist: async (id, mediaType) => {
          const isCurrentlyInList = get().isInWatchlist(id, mediaType);
          const setKey = mediaType === "movie" ? "watchlistMovies" : "watchlistSeries";
          const endpoint =
            mediaType === "movie"
              ? `/api/user/movie/${id}/watchlist`
              : `/api/user/series/${id}/watchlist`;

          // Optimistic update
          set((state) => {
            const newSet = new Set(state[setKey]);
            if (isCurrentlyInList) {
              newSet.delete(id);
            } else {
              newSet.add(id);
            }
            return { [setKey]: newSet };
          });

          // Server sync
          try {
            const response = await fetch(endpoint, {
              method: isCurrentlyInList ? "DELETE" : "POST",
            });

            if (!response.ok) {
              throw new Error("Failed to sync");
            }
          } catch (error) {
            // Revert on error
            set((state) => {
              const newSet = new Set(state[setKey]);
              if (isCurrentlyInList) {
                newSet.add(id);
              } else {
                newSet.delete(id);
              }
              return { [setKey]: newSet };
            });
            console.error("Failed to sync watchlist status:", error);
            throw error;
          }
        },

        // =====================================================================
        // Ratings
        // =====================================================================

        getRating: (id, mediaType) => {
          return get().ratings.get(getRatingKey(id, mediaType)) ?? 0;
        },

        setRating: async (id, mediaType, rating) => {
          const key = getRatingKey(id, mediaType);
          const previousRating = get().ratings.get(key);

          // Optimistic update
          set((state) => {
            const newRatings = new Map(state.ratings);
            if (rating === 0) {
              newRatings.delete(key);
            } else {
              newRatings.set(key, rating);
            }
            return { ratings: newRatings };
          });

          // Server sync
          try {
            const response = await fetch("/api/user/rating", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId: id, itemType: mediaType, rating }),
            });

            if (!response.ok) {
              throw new Error("Failed to sync");
            }
          } catch (error) {
            // Revert on error
            set((state) => {
              const newRatings = new Map(state.ratings);
              if (previousRating !== undefined) {
                newRatings.set(key, previousRating);
              } else {
                newRatings.delete(key);
              }
              return { ratings: newRatings };
            });
            console.error("Failed to sync rating:", error);
            throw error;
          }
        },

        clearRating: async (id, mediaType) => {
          const key = getRatingKey(id, mediaType);
          const previousRating = get().ratings.get(key);

          // Optimistic update
          set((state) => {
            const newRatings = new Map(state.ratings);
            newRatings.delete(key);
            return { ratings: newRatings };
          });

          // Server sync
          try {
            const response = await fetch(
              `/api/user/rating?itemId=${id}&itemType=${mediaType}`,
              { method: "DELETE" }
            );

            if (!response.ok) {
              throw new Error("Failed to sync");
            }
          } catch (error) {
            // Revert on error
            if (previousRating !== undefined) {
              set((state) => {
                const newRatings = new Map(state.ratings);
                newRatings.set(key, previousRating);
                return { ratings: newRatings };
              });
            }
            console.error("Failed to clear rating:", error);
            throw error;
          }
        },

        // =====================================================================
        // Recents (Server Synced)
        // =====================================================================

        addToRecents: async (item) => {
          const newItem: RecentItem = {
            ...item,
            id: item.itemId,
            viewedAt: new Date(),
          };

          // Optimistic update
          set((state) => {
            const filtered = state.recents.filter(
              (r) => r.itemId !== item.itemId || r.isMovie !== item.isMovie
            );
            return {
              recents: [newItem, ...filtered].slice(0, 20),
            };
          });

          // Server sync (fire and forget - don't block UI)
          fetch("/api/user/recents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          }).catch((error) => {
            console.error("Failed to sync recent to server:", error);
          });
        },

        // =====================================================================
        // Continue Watching (Server Synced)
        // =====================================================================

        addToContinueWatching: async (item) => {
          const newItem: ContinueWatchingItem = {
            ...item,
            id: item.itemId,
            updatedAt: new Date(),
          };

          // Optimistic update
          set((state) => {
            const filtered = state.continueWatching.filter(
              (c) => c.itemId !== item.itemId || c.isMovie !== item.isMovie
            );
            return {
              continueWatching: [newItem, ...filtered].slice(0, 10),
            };
          });

          // Server sync
          try {
            const response = await fetch("/api/user/continueWatching", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item),
            });

            if (!response.ok) {
              throw new Error("Failed to sync");
            }
          } catch (error) {
            console.error("Failed to sync continue watching:", error);
          }
        },

        removeFromContinueWatching: async (itemId, isMovie) => {
          // Optimistic update
          set((state) => ({
            continueWatching: state.continueWatching.filter(
              (c) => !(c.itemId === itemId && c.isMovie === isMovie)
            ),
          }));

          // Server sync
          try {
            const response = await fetch(
              `/api/user/continueWatching?itemId=${itemId}&isMovie=${isMovie}`,
              { method: "DELETE" }
            );

            if (!response.ok) {
              throw new Error("Failed to sync");
            }
          } catch (error) {
            console.error("Failed to remove from continue watching:", error);
          }
        },

        // =====================================================================
        // Country Preference
        // =====================================================================

        setCountryOverride: (countryCode) => {
          set({ countryOverride: countryCode });
        },

        // =====================================================================
        // Hydration & Reset
        // =====================================================================

        hydrate: async () => {
          const state = get();

          // Prevent concurrent hydration
          if (state.isHydrating) {
            return;
          }

          // Skip if recently hydrated (within 1 minute)
          if (state.lastHydratedAt && Date.now() - state.lastHydratedAt < 60000) {
            return;
          }

          set({ isHydrating: true });

          try {
            const response = await fetch("/api/user/library");

            if (!response.ok) {
              // Not authenticated or error - just mark as hydrated
              set({ isHydrated: true, isHydrating: false, lastHydratedAt: Date.now() });
              return;
            }

            const data = await response.json();

            set({
              watchedMovies: new Set(data.watchedMovies || []),
              watchlistMovies: new Set(data.watchlistMovies || []),
              watchlistSeries: new Set(data.watchlistSeries || []),
              ratings: new Map(
                (data.ratings || []).map(
                  (r: { itemId: number; itemType: MediaType; rating: number }) => [
                    getRatingKey(r.itemId, r.itemType),
                    r.rating,
                  ]
                )
              ),
              recents: data.recents || [],
              continueWatching: data.continueWatching || [],
              isHydrated: true,
              isHydrating: false,
              lastHydratedAt: Date.now(),
            });
          } catch (error) {
            console.error("Failed to hydrate user store:", error);
            set({ isHydrated: true, isHydrating: false });
          }
        },

        reset: () => {
          set(initialState);
        },

        setLibraryData: (data) => {
          set((state) => ({
            watchedMovies: data.watchedMovies
              ? new Set(data.watchedMovies)
              : state.watchedMovies,
            watchlistMovies: data.watchlistMovies
              ? new Set(data.watchlistMovies)
              : state.watchlistMovies,
            watchlistSeries: data.watchlistSeries
              ? new Set(data.watchlistSeries)
              : state.watchlistSeries,
            ratings: data.ratings
              ? new Map(
                  data.ratings.map((r) => [getRatingKey(r.itemId, r.itemType), r.rating])
                )
              : state.ratings,
            recents: data.recents ?? state.recents,
            continueWatching: data.continueWatching ?? state.continueWatching,
          }));
        },
      }),
      {
        name: "movie-browser-user",
        // Don't persist anything locally - server is source of truth
        // This ensures data is always fresh on new sessions
        partialize: () => ({}),
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      }
    )
  )
);

// =============================================================================
// Selectors (for performance - avoid re-renders)
// =============================================================================

export const selectIsWatched = (id: number) => (state: UserStore) =>
  state.watchedMovies.has(id);

export const selectIsInWatchlist = (id: number, mediaType: MediaType) => (state: UserStore) =>
  mediaType === "movie" ? state.watchlistMovies.has(id) : state.watchlistSeries.has(id);

export const selectRating = (id: number, mediaType: MediaType) => (state: UserStore) =>
  state.ratings.get(getRatingKey(id, mediaType)) ?? 0;

export const selectIsHydrated = (state: UserStore) => state.isHydrated;

export const selectRecents = (state: UserStore) => state.recents;

export const selectContinueWatching = (state: UserStore) => state.continueWatching;

export const selectCountryOverride = (state: UserStore) => state.countryOverride;
