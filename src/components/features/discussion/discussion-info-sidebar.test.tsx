import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiscussionInfoSidebar } from "./discussion-info-sidebar";
import type { MovieOverviewProps, SeriesOverviewProps } from "@/types";

afterEach(cleanup);

const movie: MovieOverviewProps = {
  id: 603,
  title: "The Matrix",
  overview: "A hacker learns the world is a simulation.",
  genres: [
    { id: 28, name: "Action" },
    { id: 878, name: "Science Fiction" },
  ],
  director: { id: 9339, name: "Lana Wachowski", profile_path: null },
  topCast: [
    { id: 6384, name: "Keanu Reeves", character: "Neo", profile_path: null },
    { id: 2975, name: "Laurence Fishburne", character: "Morpheus", profile_path: null },
  ],
  runtime: 136,
  status: "Released",
};

const series: SeriesOverviewProps = {
  id: 1396,
  name: "Breaking Bad",
  overview: "A chemistry teacher turns to making meth.",
  genres: [{ id: 18, name: "Drama" }],
  creators: [{ id: 66633, name: "Vince Gilligan", profile_path: null }],
  topCast: [{ id: 17419, name: "Bryan Cranston", character: "Walter White", profile_path: null }],
  number_of_seasons: 5,
  status: "Ended",
};

describe("DiscussionInfoSidebar", () => {
  it("renders the title, overview, genres, director and cast for a movie", () => {
    render(
      <DiscussionInfoSidebar item={movie} mediaType="movie" basePath="/movie/603/the-matrix" year={1999} />
    );
    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText(/hacker learns/)).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("Director")).toBeTruthy();
    expect(screen.getByText("Lana Wachowski")).toBeTruthy();
    expect(screen.getByText("Keanu Reeves")).toBeTruthy();
    expect(screen.getByText("Neo")).toBeTruthy();
  });

  it("builds a movie meta line of year · runtime · status", () => {
    render(
      <DiscussionInfoSidebar item={movie} mediaType="movie" basePath="/movie/603/the-matrix" year={1999} />
    );
    expect(screen.getByText("1999 · 2h 16m · Released")).toBeTruthy();
  });

  it("renders creators and a seasons meta line for a series", () => {
    render(
      <DiscussionInfoSidebar item={series} mediaType="series" basePath="/series/1396/breaking-bad" year={2008} />
    );
    expect(screen.getByText("Creator")).toBeTruthy();
    expect(screen.getByText("Vince Gilligan")).toBeTruthy();
    expect(screen.getByText("2008 · 5 seasons · Ended")).toBeTruthy();
  });

  it("links 'View full details' to the detail page", () => {
    render(
      <DiscussionInfoSidebar item={movie} mediaType="movie" basePath="/movie/603/the-matrix" year={1999} />
    );
    const link = screen.getByText(/View full details/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/movie/603/the-matrix");
  });
});
