import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HeroBackdropShell } from "./hero-backdrop-shell";
import { HeroLogoShell } from "./hero-logo-shell";

/**
 * The detail↔discussions shared-element morph depends on the hero shells
 * exposing a `view-transition-name` ONLY when opted in via the
 * `viewTransitionName` prop (the shells are shared with non-hero usages where a
 * stray name would create a spurious morph target). These tests pin that
 * contract: the inline style carries the name when the prop is set, and is
 * absent otherwise.
 */
describe("hero shells — viewTransitionName opt-in", () => {
  it("HeroBackdropShell sets view-transition-name on its root when opted in", () => {
    const { getByTestId } = render(
      <HeroBackdropShell mediaId={1396} mediaType="series" viewTransitionName="hero-backdrop" />
    );
    expect(getByTestId("hero-backdrop").style.viewTransitionName).toBe("hero-backdrop");
  });

  it("HeroBackdropShell omits view-transition-name by default", () => {
    const { getByTestId } = render(<HeroBackdropShell mediaId={1396} mediaType="series" />);
    expect(getByTestId("hero-backdrop").style.viewTransitionName).toBeFalsy();
  });

  it("HeroLogoShell sets view-transition-name on its rendered root when opted in", () => {
    // No CDN/TMDB image resolves in happy-dom, but the root element (image
    // branch wrapper) still carries the name immediately on first render.
    const { getByTestId } = render(
      <HeroLogoShell
        mediaId={1396}
        mediaType="series"
        fallbackText="Breaking Bad"
        viewTransitionName="hero-logo"
      />
    );
    expect(getByTestId("hero-logo").style.viewTransitionName).toBe("hero-logo");
  });

  it("HeroLogoShell omits view-transition-name by default", () => {
    const { getByTestId } = render(
      <HeroLogoShell mediaId={1396} mediaType="series" fallbackText="Breaking Bad" />
    );
    expect(getByTestId("hero-logo").style.viewTransitionName).toBeFalsy();
  });
});
