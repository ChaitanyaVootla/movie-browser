import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISeries extends Document {
  id: number;
  name: string;
  original_name?: string;
  overview?: string;
  adult: boolean;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date?: string;
  last_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genres?: { id: number; name: string }[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  type?: string;
  in_production?: boolean;
  networks?: {
    id: number;
    name: string;
    logo_path?: string;
    origin_country: string;
  }[];
  production_companies?: {
    id: number;
    name: string;
    logo_path?: string;
    origin_country: string;
  }[];
  homepage?: string;
  tagline?: string;
  created_by?: {
    id: number;
    name: string;
    profile_path?: string;
  }[];
  external_ids?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path?: string;
      order: number;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path?: string;
    }>;
  };
  videos?: {
    results: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
      official: boolean;
    }>;
  };
  images?: {
    backdrops: Array<{
      file_path: string;
      aspect_ratio: number;
      width: number;
      height: number;
      iso_639_1?: string;
      vote_average: number;
    }>;
    posters: Array<{
      file_path: string;
      aspect_ratio: number;
      width: number;
      height: number;
      iso_639_1?: string;
      vote_average: number;
    }>;
    logos: Array<{
      file_path: string;
      aspect_ratio: number;
      width: number;
      height: number;
      iso_639_1?: string;
      vote_average: number;
    }>;
  };
  seasons?: Array<{
    id: number;
    season_number: number;
    name: string;
    overview?: string;
    poster_path?: string;
    air_date?: string;
    episode_count: number;
  }>;
  next_episode_to_air?: {
    id: number;
    episode_number: number;
    season_number: number;
    name: string;
    air_date?: string;
  };
  last_episode_to_air?: {
    id: number;
    episode_number: number;
    season_number: number;
    name: string;
    air_date?: string;
  };
  googleData?: Record<string, unknown>;
  external_data?: Record<string, unknown>;
  updatedAt: Date;
}

const SeriesSchema = new Schema<ISeries>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    original_name: String,
    overview: String,
    adult: { type: Boolean, default: false },
    poster_path: String,
    backdrop_path: String,
    first_air_date: String,
    last_air_date: String,
    vote_average: Number,
    vote_count: Number,
    popularity: Number,
    genres: [{ id: Number, name: String }],
    number_of_seasons: Number,
    number_of_episodes: Number,
    episode_run_time: [Number],
    status: String,
    type: String,
    in_production: Boolean,
    networks: [
      {
        id: Number,
        name: String,
        logo_path: String,
        origin_country: String,
      },
    ],
    production_companies: [
      {
        id: Number,
        name: String,
        logo_path: String,
        origin_country: String,
      },
    ],
    homepage: String,
    tagline: String,
    created_by: [
      {
        id: Number,
        name: String,
        profile_path: String,
      },
    ],
    external_ids: {
      imdb_id: String,
      tvdb_id: Number,
    },
    credits: {
      cast: [
        {
          id: Number,
          name: String,
          character: String,
          profile_path: String,
          order: Number,
        },
      ],
      crew: [
        {
          id: Number,
          name: String,
          job: String,
          department: String,
          profile_path: String,
        },
      ],
    },
    videos: {
      results: [
        {
          id: String,
          key: String,
          name: String,
          site: String,
          type: String,
          official: Boolean,
        },
      ],
    },
    images: {
      backdrops: [
        {
          file_path: String,
          aspect_ratio: Number,
          width: Number,
          height: Number,
          iso_639_1: String,
          vote_average: Number,
        },
      ],
      posters: [
        {
          file_path: String,
          aspect_ratio: Number,
          width: Number,
          height: Number,
          iso_639_1: String,
          vote_average: Number,
        },
      ],
      logos: [
        {
          file_path: String,
          aspect_ratio: Number,
          width: Number,
          height: Number,
          iso_639_1: String,
          vote_average: Number,
        },
      ],
    },
    seasons: [
      {
        id: Number,
        season_number: Number,
        name: String,
        overview: String,
        poster_path: String,
        air_date: String,
        episode_count: Number,
      },
    ],
    next_episode_to_air: {
      id: Number,
      episode_number: Number,
      season_number: Number,
      name: String,
      air_date: String,
    },
    last_episode_to_air: {
      id: Number,
      episode_number: Number,
      season_number: Number,
      name: String,
      air_date: String,
    },
    googleData: Schema.Types.Mixed,
    external_data: Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now },
  },
  {
    strict: false, // Allow additional fields from TMDB
    collection: "series",
  }
);

// Create indexes
SeriesSchema.index({ name: "text", original_name: "text" });
SeriesSchema.index({ popularity: -1 });
SeriesSchema.index({ vote_average: -1 });
SeriesSchema.index({ first_air_date: -1 });

// Light fields for list views
export const SeriesLightFields =
  "id name vote_average vote_count genres poster_path backdrop_path first_air_date last_air_date number_of_seasons status next_episode_to_air last_episode_to_air external_data images.logos homepage popularity";

export const Series: Model<ISeries> =
  mongoose.models.series || mongoose.model<ISeries>("series", SeriesSchema);


