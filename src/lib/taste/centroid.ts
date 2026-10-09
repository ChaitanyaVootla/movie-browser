/**
 * Rocchio taste centroid (spec §4):
 *   c = normalize( mean_w(P) − β · mean_|w|(N) ),  β = ROCCHIO_BETA
 * over L2-normalised title embeddings. NULL under MIN_POSITIVES_FOR_CENTROID.
 */
import { MIN_POSITIVES_FOR_CENTROID, ROCCHIO_BETA } from "./constants";
import { l2Normalize, weightedMean } from "./vector";

export interface EmbeddedTitle {
  weight: number;
  /** Raw embedding (normalised internally). */
  vector: ArrayLike<number>;
}

export interface RocchioResult {
  centroid: number[] | null;
  negCentroid: number[] | null;
  positivesUsed: number;
  negativesUsed: number;
}

export function rocchioCentroid(
  items: readonly EmbeddedTitle[],
  opts: { beta?: number; minPositives?: number } = {}
): RocchioResult {
  const beta = opts.beta ?? ROCCHIO_BETA;
  const minPositives = opts.minPositives ?? MIN_POSITIVES_FOR_CENTROID;
  const pos: { vector: number[]; weight: number }[] = [];
  const neg: { vector: number[]; weight: number }[] = [];
  for (const it of items) {
    if (it.weight === 0) continue;
    const unit = l2Normalize(it.vector);
    if (!unit) continue;
    if (it.weight > 0) pos.push({ vector: unit, weight: it.weight });
    else neg.push({ vector: unit, weight: -it.weight });
  }
  const negMean = weightedMean(neg);
  const negCentroid = negMean ? l2Normalize(negMean) : null;
  if (pos.length < minPositives) {
    return { centroid: null, negCentroid, positivesUsed: pos.length, negativesUsed: neg.length };
  }
  const posMean = weightedMean(pos);
  if (!posMean) {
    return { centroid: null, negCentroid, positivesUsed: pos.length, negativesUsed: neg.length };
  }
  const combined = negMean ? posMean.map((v, i) => v - beta * negMean[i]) : posMean;
  return {
    centroid: l2Normalize(combined),
    negCentroid,
    positivesUsed: pos.length,
    negativesUsed: neg.length,
  };
}
