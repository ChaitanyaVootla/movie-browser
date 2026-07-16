/**
 * Markdown builder dispatcher.
 *
 * Each builder is pure and takes already-fetched (read-only PG) data — no I/O
 * here. The route handler fetches via `../data` then calls one of these.
 */

export { movieToMarkdown } from "./movie";
export { seriesToMarkdown } from "./series";
export { personToMarkdown } from "./person";
export { listToMarkdown } from "./list";
export { searchToMarkdown } from "./search";
export { staticToMarkdown } from "./static";
export { homeToMarkdown } from "./home";
