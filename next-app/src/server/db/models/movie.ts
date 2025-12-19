import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMovie extends Document {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  adult: boolean;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genres?: { id: number; name: string }[];
  production_companies?: {
    id: number;
    name: string;
    logo_path?: string;
    origin_country: string;
  }[];
  homepage?: string;
  imdb_id?: string;
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
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
  external_data?: {
    imdb_rating?: number;
    imdb_votes?: number;
    rotten_tomatoes?: number;
    metacritic?: number;
  };
  googleData?: Record<string, unknown>;
  updatedAt: Date;
}

const MovieSchema = new Schema<IMovie>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true },
    original_title: String,
    overview: String,
    adult: { type: Boolean, default: false },
    poster_path: String,
    backdrop_path: String,
    release_date: String,
    runtime: Number,
    vote_average: Number,
    vote_count: Number,
    popularity: Number,
    genres: [{ id: Number, name: String }],
    production_companies: [
      {
        id: Number,
        name: String,
        logo_path: String,
        origin_country: String,
      },
    ],
    homepage: String,
    imdb_id: String,
    tagline: String,
    status: String,
    budget: Number,
    revenue: Number,
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
    external_data: {
      imdb_rating: Number,
      imdb_votes: Number,
      rotten_tomatoes: Number,
      metacritic: Number,
    },
    googleData: Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now },
  },
  {
    strict: false, // Allow additional fields from TMDB
    collection: "movies",
  }
);

// Create indexes
MovieSchema.index({ title: "text", original_title: "text" });
MovieSchema.index({ popularity: -1 });
MovieSchema.index({ vote_average: -1 });
MovieSchema.index({ release_date: -1 });

// Light fields for list views
export const MovieLightFields =
  "id title vote_average vote_count genres poster_path backdrop_path release_date external_data images.logos homepage popularity";

export const Movie: Model<IMovie> =
  mongoose.models.Movie || mongoose.model<IMovie>("Movie", MovieSchema);
