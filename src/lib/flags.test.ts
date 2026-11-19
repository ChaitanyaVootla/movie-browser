import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flagUrl } from "./flags";

describe("flagUrl", () => {
  it("returns a same-origin path, never flagcdn", () => {
    expect(flagUrl("IN")).toBe("/images/flags/in.png");
    expect(flagUrl(" us ")).toBe("/images/flags/us.png");
  });

  it("rejects non-ISO2 input", () => {
    expect(flagUrl("")).toBeNull();
    expect(flagUrl(null)).toBeNull();
    expect(flagUrl("usa")).toBeNull();
    expect(flagUrl("../x")).toBeNull();
  });

  it("ships a file for the common codes", () => {
    for (const c of ["in", "us", "gb", "ca", "au", "de", "fr", "jp", "kr", "xk"]) {
      expect(existsSync(path.join(process.cwd(), "public/images/flags", `${c}.png`))).toBe(true);
    }
  });
});
