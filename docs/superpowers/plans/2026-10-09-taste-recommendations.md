# Taste Recommendations + Taste Match + Cue — implementation plan

Spec: `docs/superpowers/specs/2026-10-09-taste-recommendations-design.md`.
Branch `feat/taste-recs` (on `feat/taste-profile-core`). Local only; dev DB :5436.

## Tasks

1. [ ] **Pure rec math** `src/lib/taste/recommend.ts` + tests: `scoreCandidates`
   (rel/quality/pop blend), `genreDistribution`, `klDivergence` (smoothed),
   `greedySelect` (MMR + calibration toggles), `explainItem`, `facetLabel`,
   `buildRows`. Constants in `src/lib/taste/recommend-constants.ts`
   (`REC_ALGO_VERSION`).
2. [ ] **Pure compatibility + gate** `src/lib/taste/compatibility.ts` + tests:
   `pearson`, `scoreSim`, `likedSim`, `tasteSim`, `computeTasteMatch`,
   `canViewTasteMatch`, `publicRatingsFromSignals`.
3. [ ] **DB layer** `src/server/db/postgres/social/taste-recs.ts`: exclusions,
   ANN candidates (MATERIALIZED CTE batch, `annSessionSql`), candidate details,
   anchor details, popular-by-genre fallback, twins scan, title refs.
4. [ ] **Service** `src/server/services/taste/recommend.ts` (LRU cache, fallbacks,
   never throws) + `match.ts` (taste match + twins). Integration test
   (self-skipping without :5436).
5. [ ] **Server actions** `src/server/actions/taste-recs.ts`: `getHomeRecs`,
   `getTasteMatch(username)`, `getTasteTwins()` (Zod-validated, POST).
6. [ ] **Analytics** ActionTypes `rec_impression`, `rec_click`,
   `taste_match_view`, `taste_twin_click`.
7. [ ] **UI**: `components/features/home/for-you-section.tsx` (+ twins strip),
   mounted in `app/page.tsx`; `components/features/profile/taste-match.tsx` in the
   reserved slot. Render tests.
8. [ ] **Cue**: taste summary in `get_user_profile`; `recommend_for_me` tool;
   tools/index + system prompt + tests.
9. [ ] **Eval** `scripts/eval-recs.ts`; run on dev seed; record numbers.
10. [ ] **Verify**: typecheck, lint, unit tests (same 23 pre-existing failures),
    browser at 390/1440 on :3014, ISR check, build if disk allows.
11. [ ] **Docs**: `taste-profile.md`, `ai-agent.md`, CLAUDE.md Cue paragraph,
    PROGRESS.md.
