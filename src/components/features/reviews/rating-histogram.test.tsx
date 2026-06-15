import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RatingHistogram } from "./rating-histogram";
import type { RatingHistogram as RatingHistogramData } from "@/server/db/postgres/social/ratings";

afterEach(cleanup);

/** Build a 1..10 bucket map, filling unspecified scores with 0. */
function buckets(partial: Record<number, number>): Record<number, number> {
  const b: Record<number, number> = {};
  for (let s = 1; s <= 10; s++) b[s] = partial[s] ?? 0;
  return b;
}

describe("RatingHistogram", () => {
  it("shows the average, the /10 scale, a star summary, and the count", () => {
    const histogram: RatingHistogramData = {
      buckets: buckets({ 8: 3, 10: 1 }),
      average: 8.5,
      total: 4,
    };
    render(<RatingHistogram histogram={histogram} />);

    expect(screen.getByText("8.5")).toBeTruthy();
    expect(screen.getByText("/10")).toBeTruthy();
    expect(screen.getByText("4 ratings")).toBeTruthy();
    // The star summary is an accessible image labelled with the average.
    expect(
      screen.getByRole("img", { name: /average rating 8\.5 out of 10/i })
    ).toBeTruthy();
  });

  it("singularizes a single rating", () => {
    const histogram: RatingHistogramData = {
      buckets: buckets({ 7: 1 }),
      average: 7,
      total: 1,
    };
    render(<RatingHistogram histogram={histogram} />);

    expect(screen.getByText("1 rating")).toBeTruthy();
  });

  it("renders the empty state and no star summary when there are no ratings", () => {
    const histogram: RatingHistogramData = {
      buckets: buckets({}),
      average: null,
      total: 0,
    };
    render(<RatingHistogram histogram={histogram} />);

    expect(screen.getByText("No ratings yet")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
