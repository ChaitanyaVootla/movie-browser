/**
 * Standardized TMDB image-picker contracts. Shared by the canonical
 * `MediaImagePicker` UI and the `image-picker` server actions. All image paths
 * are TMDB FILE PATHS ("/abc.jpg") — prefix with TMDB_IMAGE_BASE + a size at
 * render. TMDB URLs are canonical (not our per-item CDN), so any picked path is
 * directly renderable everywhere.
 */

/** Where an image comes from. `episode` images are stills under a series id. */
export type ImageEntityType = "movie" | "series" | "person" | "episode";

/** The kind of artwork. Drives aspect ratio + which grid a kind renders in. */
export type ImageKind = "backdrop" | "poster" | "logo" | "profile" | "still";

/** A search hit the user can pull images from. */
export interface PickerEntityResult {
  entityType: "movie" | "series" | "person";
  tmdbId: number;
  name: string;
  /** Release year (titles) or known-for department (people). */
  subtitle: string | null;
  /** Poster (titles) / profile (people) path for the result chip. */
  imagePath: string | null;
}

/** One artwork file with the metadata the grid needs to render + rank it. */
export interface PickerImage {
  filePath: string;
  kind: ImageKind;
  /** width / height. Backdrops/stills ≈ 1.78, posters/profiles ≈ 0.667. */
  aspectRatio: number;
  /** TMDB community rating (0 when none) — used to surface the best first. */
  voteAverage: number;
  /** ISO 639-1 language, or null for language-neutral artwork. */
  lang: string | null;
}

/** All of an entity's images, grouped by kind (each sorted best-first). */
export interface PickerImageGroups {
  backdrops: PickerImage[];
  posters: PickerImage[];
  logos: PickerImage[];
  profiles: PickerImage[];
  stills: PickerImage[];
}

/** What the picker hands back when the user chooses an image. */
export interface PickedImage {
  entityType: ImageEntityType;
  /** movie/series/person tmdb id (an episode reports its series id). */
  tmdbId: number;
  entityName: string;
  imagePath: string;
  kind: ImageKind;
  aspectRatio: number;
}
