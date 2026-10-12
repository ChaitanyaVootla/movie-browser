/**
 * Taste widget entry points. Taste v2 (spec 2026-10-12 §4.1) folds "Taste DNA"
 * and "Taste clusters" into ONE Taste card (`../taste/taste-card.tsx`); the old
 * widget types stay valid for saved layouts and both render that card
 * (`resolveLayout` migrates them to `taste.card`). Data = the PUBLIC snapshot
 * on the cacheable profile DTO; nothing viewer-specific.
 */
export { TasteCard } from "../taste/taste-card";
export { readyTaste, hasTasteCard, displayMoods } from "../taste/taste-data";
