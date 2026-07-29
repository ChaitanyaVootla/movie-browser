/**
 * DiscussionForumPosting rules, pinned from real Search Console failures
 * (Jul 30 2026: 241 invalid items, 0 valid, on two critical issues).
 *
 * Both are silent to typecheck — the schema is a plain object — so they need
 * tests or they regress the moment someone "tidies" the builder.
 */
import { describe, it, expect } from "vitest";
import { discussionForumPosting } from "./jsonld";

const about = { "@type": "Movie", name: "Arrival" };

describe("discussionForumPosting", () => {
  it("emits NOTHING for a thread with no published posts", () => {
    // GSC issue #1 at scale: empty episode/title shells carried a headline and
    // an empty comment array — no text/image/video anywhere → invalid item.
    expect(
      discussionForumPosting({ headline: "Arrival discussion", url: "u", commentCount: 0, roots: [], about })
    ).toBeNull();
  });

  it("models the opening post as the posting itself (text + datePublished + author)", () => {
    const result = discussionForumPosting({
      headline: "Arrival discussion",
      url: "https://themoviebrowser.com/movie/329865/arrival/discussions",
      commentCount: 2,
      roots: [
        { body: "The non-linear structure is the whole point.", createdAt: new Date("2026-07-01T10:00:00Z"), author: { username: "ada" } },
        { body: "Agreed — second watch reframes everything.", createdAt: "2026-07-02T11:00:00Z", author: { username: "bea" } },
      ],
      about,
    });

    // Issue #1: the POSTING needs content of its own, not just nested comments.
    expect(result?.text).toBe("The non-linear structure is the whole point.");
    // Issue #2: datePublished always present, and it is the POST's date — not
    // the movie release / episode air date the old code used.
    expect(result?.datePublished).toBe("2026-07-01T10:00:00.000Z");
    expect(result?.author).toEqual({ "@type": "Person", name: "ada" });
    // Replies (not the opening post) become comments.
    expect(result?.comment).toEqual([
      {
        "@type": "Comment",
        text: "Agreed — second watch reframes everything.",
        dateCreated: "2026-07-02T11:00:00Z",
        author: { "@type": "Person", name: "bea" },
      },
    ]);
  });

  it("is valid with a single post: text and datePublished present, no empty comment array", () => {
    const result = discussionForumPosting({
      headline: "h",
      url: "u",
      commentCount: 1,
      roots: [{ body: "Only post.", createdAt: new Date("2026-07-01T00:00:00Z"), author: null }],
      about,
    });
    expect(result?.text).toBe("Only post.");
    expect(result?.datePublished).toBeDefined();
    // omitEmpty drops the empty array rather than emitting `comment: []`.
    expect(result && "comment" in result).toBe(false);
    // No username/name → the neutral fallback, never a real name or an id.
    expect(result?.author).toEqual({ "@type": "Person", name: "Member" });
  });

  it("caps inlined replies so a hot thread does not bloat the page", () => {
    const roots = Array.from({ length: 30 }, (_, i) => ({
      body: `post ${i}`,
      createdAt: new Date("2026-07-01T00:00:00Z"),
      author: { username: `u${i}` },
    }));
    const result = discussionForumPosting({ headline: "h", url: "u", commentCount: 30, roots, about });
    expect((result?.comment as unknown[]).length).toBe(9);
  });
});
