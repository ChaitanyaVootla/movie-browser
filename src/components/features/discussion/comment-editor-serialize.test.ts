import { describe, it, expect } from "vitest";
import {
  serializeToBody,
  mentionToToken,
  type EditorJSONNode,
  type MentionNodeAttrs,
} from "./comment-editor-serialize";

// A tiny emoji resolver mirroring the gitHubEmojis name→unicode mapping.
const resolveEmoji = (name: string): string | undefined =>
  ({ smile: "😄", heart: "❤️", "+1": "👍" })[name];

const text = (t: string): EditorJSONNode => ({ type: "text", text: t });
const mention = (attrs: MentionNodeAttrs): EditorJSONNode => ({ type: "mention", attrs: { ...attrs } });
const emoji = (name: string): EditorJSONNode => ({ type: "emoji", attrs: { name } });
const para = (...content: EditorJSONNode[]): EditorJSONNode => ({ type: "paragraph", content });
const doc = (...content: EditorJSONNode[]): EditorJSONNode => ({ type: "doc", content });

describe("mentionToToken", () => {
  it("user → @username (strips a leading @ on id)", () => {
    expect(mentionToToken({ kind: "user", id: "@bea", label: "Bea" })).toBe("@bea");
    expect(mentionToToken({ kind: "user", id: "ada", label: "Ada" })).toBe("@ada");
  });
  it("movie/series/person → [[kind:id|Name]]", () => {
    expect(mentionToToken({ kind: "movie", id: "550", label: "Fight Club" })).toBe("[[movie:550|Fight Club]]");
    expect(mentionToToken({ kind: "series", id: "1396", label: "Breaking Bad" })).toBe("[[series:1396|Breaking Bad]]");
    expect(mentionToToken({ kind: "person", id: "287", label: "Brad Pitt" })).toBe("[[person:287|Brad Pitt]]");
  });
  it("episode → [[ep:SERIESID:SEASON:EP|Name]]", () => {
    expect(
      mentionToToken({ kind: "episode", id: "1396", label: "Ozymandias", season: 5, episode: 14 })
    ).toBe("[[ep:1396:5:14|Ozymandias]]");
  });
  it("strips ']' from labels (ENTITY_RE forbids it inside the name)", () => {
    expect(mentionToToken({ kind: "movie", id: "1", label: "Brackets ] here" })).toBe("[[movie:1|Brackets  here]]");
  });
  it("episode missing natural-key parts falls back to a plain label (never a malformed token)", () => {
    expect(mentionToToken({ kind: "episode", id: "1396", label: "Some Ep" })).toBe("Some Ep");
  });
});

describe("serializeToBody", () => {
  it("preserves plain text", () => {
    expect(serializeToBody(doc(para(text("hello world"))), resolveEmoji)).toBe("hello world");
  });

  it("the spurious-newline bug: '@user nice' must serialize on ONE line", () => {
    const out = serializeToBody(
      doc(para(text("hi "), mention({ kind: "user", id: "bea", label: "bea" }), text(" nice"))),
      resolveEmoji
    );
    expect(out).toBe("hi @bea nice");
    expect(out).not.toContain("\n");
  });

  it("entity chip → token, inline with surrounding text", () => {
    const out = serializeToBody(
      doc(para(text("watch "), mention({ kind: "movie", id: "550", label: "Fight Club" }), text(" tonight"))),
      resolveEmoji
    );
    expect(out).toBe("watch [[movie:550|Fight Club]] tonight");
  });

  it("multi-word episode chip round-trips to a valid ep token", () => {
    const out = serializeToBody(
      doc(para(mention({ kind: "episode", id: "1396", label: "Ozymandias", season: 5, episode: 14 }))),
      resolveEmoji
    );
    expect(out).toBe("[[ep:1396:5:14|Ozymandias]]");
  });

  it("emoji node → unicode char", () => {
    expect(serializeToBody(doc(para(text("nice "), emoji("smile"))), resolveEmoji)).toBe("nice 😄");
  });

  it("unknown emoji falls back to :shortcode: (never lossy)", () => {
    expect(serializeToBody(doc(para(emoji("unknown_xyz"))), resolveEmoji)).toBe(":unknown_xyz:");
  });

  it("hard break → \\n; paragraph gap → \\n\\n", () => {
    const out = serializeToBody(
      doc(para(text("line1"), { type: "hardBreak" }, text("line2")), para(text("para2"))),
      resolveEmoji
    );
    expect(out).toBe("line1\nline2\n\npara2");
  });

  it("trims empty leading/trailing paragraphs (no stray newline)", () => {
    const out = serializeToBody(
      doc(para(), para(text("body")), para()),
      resolveEmoji
    );
    expect(out).toBe("body");
  });

  it("a full mixed comment serializes correctly", () => {
    const out = serializeToBody(
      doc(
        para(
          text("loved "),
          mention({ kind: "series", id: "1396", label: "Breaking Bad" }),
          text(" — esp "),
          mention({ kind: "episode", id: "1396", label: "Ozymandias", season: 5, episode: 14 }),
          text(" "),
          emoji("heart"),
          text(" cc "),
          mention({ kind: "user", id: "ada", label: "ada" })
        )
      ),
      resolveEmoji
    );
    expect(out).toBe("loved [[series:1396|Breaking Bad]] — esp [[ep:1396:5:14|Ozymandias]] ❤️ cc @ada");
  });

  it("empty doc → empty string", () => {
    expect(serializeToBody(doc(), resolveEmoji)).toBe("");
    expect(serializeToBody(null, resolveEmoji)).toBe("");
  });
});
