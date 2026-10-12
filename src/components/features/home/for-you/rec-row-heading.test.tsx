import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecRowDTO, RecThumbRef } from "@/lib/taste/recommend-types";

vi.mock("next/image", () => ({ default: () => null }));

import { BecauseHeading } from "./rec-row-heading";

const ref = (id: number, title: string): RecThumbRef => ({ mediaType: "movie", id, title, posterPath: null });
const row = (anchors: RecThumbRef[]): RecRowDTO => ({
  id: "cluster-0",
  kind: "because",
  anchors,
  label: null,
  items: [],
  tune: null,
});

describe("BecauseHeading", () => {
  it("two anchors read in full at every width (no '& 1 more')", () => {
    const { container } = render(<BecauseHeading row={row([ref(1, "Se7en"), ref(2, "GoodFellas")])} onOpenRow={() => {}} />);
    expect(screen.getByText("Because you loved Se7en & GoodFellas")).toBeTruthy();
    expect(container.textContent).not.toMatch(/1 more/);
  });

  it("three anchors: full list on sm+, 'A & 2 more' on mobile, which may wrap to two lines", () => {
    render(<BecauseHeading row={row([ref(1, "The Matrix"), ref(2, "Blade Runner"), ref(3, "Inception")])} onOpenRow={() => {}} />);
    expect(screen.getByText("Because you loved The Matrix, Blade Runner & Inception")).toBeTruthy();
    const mobile = screen.getByText("Because you loved The Matrix & 2 more");
    expect(mobile.className).toContain("line-clamp-2");
  });
});
