import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudienceFilterSlot } from "./audience-filter-slot";

describe("AudienceFilterSlot", () => {
  it("renders the public-only audience label and is disabled (circles not wired)", () => {
    render(<AudienceFilterSlot />);
    const btn = screen.getByRole("button", { name: /everyone/i });
    expect(btn).toBeDisabled();
  });

  it("is hidden from assistive tech as a future affordance", () => {
    const { container } = render(<AudienceFilterSlot />);
    expect(container.firstChild).toHaveAttribute("data-circles-readiness", "true");
  });
});
