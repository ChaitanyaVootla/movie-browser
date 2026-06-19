import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas, escaped quotes, and MULTILINE bodies (Letterboxd reviews)", () => {
    const text = 'Name,Review\nHeat,"Line one\nLine ""two"", quoted"\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Review"],
      ["Heat", 'Line one\nLine "two", quoted'],
    ]);
  });

  it("handles CRLF line endings and a BOM", () => {
    expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a final row without trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("maps rows to header-keyed records and skips blank lines", () => {
    const recs = parseCsvRecords("Name,Year\nHeat,1995\n\nSe7en,1995\n");
    expect(recs).toEqual([
      { Name: "Heat", Year: "1995" },
      { Name: "Se7en", Year: "1995" },
    ]);
  });
});

describe("toCsv", () => {
  it("quotes fields containing commas, quotes, or newlines", () => {
    const out = toCsv(["a", "b"], [["x,y", 'he said "hi"\nbye']]);
    expect(out).toBe('a,b\n"x,y","he said ""hi""\nbye"\n');
  });
});
