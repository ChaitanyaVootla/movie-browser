/**
 * Initials for an avatar fallback: first letters of the first two words, or the
 * first two letters of a single word. "?" when there's nothing usable.
 */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0]?.slice(0, 2).toUpperCase() ?? "") || "?";
}
