"use server";

import { z } from "zod";
import { searchMulti, searchPerson } from "@/server/services/tmdb";
import type { MovieListItem, SeriesListItem } from "@/types";

// Validation schemas
const SearchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  page: z.number().int().positive().default(1),
});

// Search result types
export interface SearchMovieResult extends MovieListItem {
  media_type: "movie";
}

export interface SearchSeriesResult extends SeriesListItem {
  media_type: "tv";
}

export interface SearchPersonResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  media_type: "person";
  known_for?: Array<{
    id: number;
    title?: string;
    name?: string;
    media_type: "movie" | "tv";
    poster_path: string | null;
  }>;
}

export type SearchResult = SearchMovieResult | SearchSeriesResult | SearchPersonResult;

export interface SearchResponse {
  results: SearchResult[];
  movies: SearchMovieResult[];
  series: SearchSeriesResult[];
  people: SearchPersonResult[];
  page: number;
  total_pages: number;
  total_results: number;
}

/**
 * Multi-search across movies, TV shows, and people
 * Used for both autocomplete and full search results
 */
export async function search(input: z.infer<typeof SearchQuerySchema>): Promise<SearchResponse> {
  const { query, page } = SearchQuerySchema.parse(input);

  const response = await searchMulti(query, page);

  // Type-cast and categorize results
  const results = response.results as SearchResult[];
  const movies: SearchMovieResult[] = [];
  const series: SearchSeriesResult[] = [];
  const people: SearchPersonResult[] = [];

  for (const result of results) {
    if (result.media_type === "movie") {
      movies.push(result as SearchMovieResult);
    } else if (result.media_type === "tv") {
      series.push(result as SearchSeriesResult);
    } else if (result.media_type === "person") {
      people.push(result as SearchPersonResult);
    }
  }

  return {
    results,
    movies,
    series,
    people,
    page: response.page,
    total_pages: response.total_pages,
    total_results: response.total_results,
  };
}

/**
 * Search for people only (used for cast/crew filters)
 */
export async function searchPeople(query: string, page = 1) {
  const response = await searchPerson(query, page);

  return {
    results: response.results.map((person) => ({
      ...person,
      media_type: "person" as const,
    })),
    page: response.page,
    total_pages: response.total_pages,
    total_results: response.total_results,
  };
}

/**
 * Quick search for autocomplete (limited results)
 * Returns top 3 from each category
 */
export async function quickSearch(query: string): Promise<{
  movies: SearchMovieResult[];
  series: SearchSeriesResult[];
  people: SearchPersonResult[];
}> {
  if (!query.trim()) {
    return { movies: [], series: [], people: [] };
  }

  const response = await search({ query, page: 1 });

  return {
    movies: response.movies.slice(0, 3),
    series: response.series.slice(0, 3),
    people: response.people.slice(0, 3),
  };
}

