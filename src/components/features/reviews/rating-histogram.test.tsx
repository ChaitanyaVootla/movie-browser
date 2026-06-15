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
  it("renders the average and at least one bar when there are ratings", () => {
    const histogram: RatingHistogramData = {
      buckets: buckets({ 8: 3, 10: 1 }),
      average: 8.5,
      total: 4,
    };
    render(<RatingHistogram histogram={histogram} />);

    // Average rendered to one decimal.
    expect(screen.getByText("8.5")).toBeTruthy();
    // Total count.
    expect(screen.getByText("4 ratings")).toBeTruthy();
    // Distribution bars present.
    expect(screen.getAllByTestId("histogram-bar").length).toBeGreaterThan(0);
  });

  it("renders the empty state and no bars when there are no ratings", () => {
    const histogram: RatingHistogramData = {
      buckets: buckets({}),
      average: null,
      total: 0,
    };
    render(<RatingHistogram histogram={histogram} />);

    expect(screen.getByText("No ratings yet")).toBeTruthy();
    expect(screen.queryAllByTestId("histogram-bar").length).toBe(0);
  });
});
