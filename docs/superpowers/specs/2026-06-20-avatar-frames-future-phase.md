# Avatar Frames — future phase (achievement-gated flair)

**Status:** idea captured, NOT built. Shipped foundation (2026-06-20): the
per-user **accent ring** on every avatar (see below). This doc records the
direction so a future session can build on it instead of rediscovering it.

## What shipped (the foundation)

`UserAvatar` (`src/components/features/profile/user-avatar.tsx`) now renders a
per-user **accent ring** everywhere an avatar appears (nav, profile hero, review
& comment chips, list owner, follows). The ring color is the user's chosen
profile accent (`metadata.profile.accent` → `PROFILE_ACCENT_VARS[accent].brand`),
resolved via `resolveAccent()` (`src/lib/resolve-avatar.ts`) and threaded through
the same DTOs as `avatarUrl`/`avatarCrop`. Current user reads it from the user
store (`viewerAccent`, hydrated via `/api/user/library`); other users from their
DTO. Ring is a box-shadow on the avatar root (`ringWidthPx` prop), so it composes
with the crop/image and isn't clipped.

**This ring is the extension point for frames.** A "frame" is just a richer
treatment of that same ring slot.

## The idea (later)

Let users earn/equip **cooler avatar treatments** as they use the app:
animated/glowing rings, gradient or multi-stop rings, particle/shimmer effects —
unlocked by activity milestones and streaks. Examples:

- 50 / 250 / 1000 titles watched → bronze/silver/gold glow tiers
- Long current streak (e.g. 30/100 days) → animated pulse
- Combinations (e.g. "critic": N reviews + N likes received) → special frame
- Seasonal / event frames

## Design sketch for when it's built

1. **Source of truth for unlocks:** `user_stats` already aggregates
   watched/episodes/hours/streaks (`social/stats*.ts`); reviews/likes counts are
   derivable. Define a pure `resolveAvatarFrame(stats, equippedFrameId)` →
   `FrameSpec` (ring style tokens, optional animation class). Keep it PURE and
   unit-tested, mirroring `avatar-crop`/`resolve-avatar`.
2. **Equipped vs auto:** store the user's chosen frame in
   `metadata.profile.frame` (JSON, no migration), validated like `avatarCrop`.
   `resolveAccent`-style resolver returns the frame; gate equip by unlock state
   server-side (never trust the client's equipped id).
3. **Render:** extend `UserAvatar` with a `frame?: FrameSpec` prop that renders
   the ring/glow (CSS animations live in `globals.css`; respect
   `prefers-reduced-motion` — no infinite animation for users who opt out).
   Everywhere already passes through `UserAvatar`, so one prop lights it up
   app-wide.
4. **Threading:** add `frame` next to `accent` in the same DTOs + the
   `/api/user/library` `viewer` payload + user store. The plumbing path is
   already established by the accent work — copy it.
5. **Performance:** animated rings are CSS-only (no JS rAF); cap the number of
   simultaneously-animated avatars in dense lists (e.g. only animate the
   hero/own avatar, static glow elsewhere) to avoid paint cost on long threads.
6. **DESIGN.md:** add a "Avatar frames" recipe (tiers, tokens, motion rules)
   before building — accent ring + frame tokens should live there.

## Invariants to preserve

- Frame data is viewer-agnostic (the *subject's* earned flair), so it stays safe
  in ISR-cached HTML (social-features invariant 1) — same as the accent ring.
- Unlock evaluation is server-side; the client only renders what the resolved
  DTO says.
