import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentItem {
  itemId: number;
  isMovie: boolean;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  viewedAt: Date;
}

interface UserState {
  // Watched movies
  watchedMovies: Set<number>;
  isWatched: (id: number) => boolean;
  addWatched: (id: number) => void;
  removeWatched: (id: number) => void;
  toggleWatched: (id: number) => Promise<void>;

  // Watchlist movies
  watchlistMovies: Set<number>;
  isInWatchlist: (id: number) => boolean;
  addToWatchlist: (id: number) => void;
  removeFromWatchlist: (id: number) => void;
  toggleWatchlist: (id: number) => Promise<void>;

  // Recent items
  recents: RecentItem[];
  addToRecents: (item: RecentItem) => void;

  // Hydration
  hydrate: () => Promise<void>;
  isHydrated: boolean;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // Initial state
      watchedMovies: new Set(),
      watchlistMovies: new Set(),
      recents: [],
      isHydrated: false,

      // Watched movies
      isWatched: (id) => get().watchedMovies.has(id),

      addWatched: (id) => {
        set((state) => ({
          watchedMovies: new Set([...state.watchedMovies, id]),
        }));
      },

      removeWatched: (id) => {
        set((state) => {
          const newSet = new Set(state.watchedMovies);
          newSet.delete(id);
          return { watchedMovies: newSet };
        });
      },

      toggleWatched: async (id) => {
        const isCurrentlyWatched = get().isWatched(id);

        // Optimistic update
        if (isCurrentlyWatched) {
          get().removeWatched(id);
        } else {
          get().addWatched(id);
        }

        // Server sync
        try {
          await fetch(`/api/user/movie/${id}/watched`, {
            method: isCurrentlyWatched ? "DELETE" : "POST",
          });
        } catch (error) {
          // Revert on error
          if (isCurrentlyWatched) {
            get().addWatched(id);
          } else {
            get().removeWatched(id);
          }
          console.error("Failed to sync watched status:", error);
        }
      },

      // Watchlist
      isInWatchlist: (id) => get().watchlistMovies.has(id),

      addToWatchlist: (id) => {
        set((state) => ({
          watchlistMovies: new Set([...state.watchlistMovies, id]),
        }));
      },

      removeFromWatchlist: (id) => {
        set((state) => {
          const newSet = new Set(state.watchlistMovies);
          newSet.delete(id);
          return { watchlistMovies: newSet };
        });
      },

      toggleWatchlist: async (id) => {
        const isCurrentlyInList = get().isInWatchlist(id);

        // Optimistic update
        if (isCurrentlyInList) {
          get().removeFromWatchlist(id);
        } else {
          get().addToWatchlist(id);
        }

        // Server sync
        try {
          await fetch(`/api/user/movie/${id}/watchList`, {
            method: isCurrentlyInList ? "DELETE" : "POST",
          });
        } catch (error) {
          // Revert on error
          if (isCurrentlyInList) {
            get().addToWatchlist(id);
          } else {
            get().removeFromWatchlist(id);
          }
          console.error("Failed to sync watchlist status:", error);
        }
      },

      // Recents
      addToRecents: (item) => {
        set((state) => {
          // Remove existing entry for this item
          const filtered = state.recents.filter(
            (r) => r.itemId !== item.itemId || r.isMovie !== item.isMovie
          );
          // Add to front, keep max 20
          return {
            recents: [{ ...item, viewedAt: new Date() }, ...filtered].slice(0, 20),
          };
        });
      },

      // Hydration from server
      hydrate: async () => {
        try {
          const [watchedRes, watchlistRes, recentsRes] = await Promise.all([
            fetch("/api/user/movie/watched").then((r) => (r.ok ? r.json() : [])),
            fetch("/api/user/movie/watchList").then((r) => (r.ok ? r.json() : [])),
            fetch("/api/user/recents").then((r) => (r.ok ? r.json() : [])),
          ]);

          set({
            watchedMovies: new Set(watchedRes),
            watchlistMovies: new Set(watchlistRes),
            recents: recentsRes,
            isHydrated: true,
          });
        } catch (error) {
          console.error("Failed to hydrate user store:", error);
          set({ isHydrated: true });
        }
      },
    }),
    {
      name: "movie-browser-user",
      // Only persist recents locally for quick access
      // Server is source of truth for watched/watchlist
      partialize: (state) => ({ recents: state.recents }),
      // Custom serialization for Set
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          return JSON.parse(str);
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
