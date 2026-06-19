import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CueBadge } from "./cue-badge";

describe("CueBadge", () => {
  it("renders an AI label", () => {
    render(<CueBadge />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });
});
