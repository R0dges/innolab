import type { RubricCriterion, Score } from "@/lib/db";

/**
 * Scoring and cross-judge normalization.
 *
 * Everything here is pure and deterministic so it can be unit-tested and so the
 * numbers a judge sees, the CSV export, and the results page all agree. Nothing
 * is stored pre-aggregated: re-weighting the rubric or a late score edit is
 * always reflected because the aggregate is computed on read.
 *
 * The maths is documented in full in JUDGING.md. In brief:
 *
 * - A **raw score** for one (judge, project) is the weighted mean of that
 *   judge's per-criterion marks, weights normalized to sum to 1. A coach's
 *   single event-level favourite adds one point to the criteria total, which
 *   is `1 / criterion count` on this mean scale.
 * - **Normalization** corrects for judges who run hot or cold. For each judge we
 *   compute the mean and standard deviation of their raw scores, convert each of
 *   their scores to a z-score, then map the z-scores back onto the 1–5 scale
 *   using the global mean and a fixed spread. A judge who marks everything a 3
 *   (zero variance) contributes no signal, so their scores collapse to the
 *   global mean rather than blowing up a divide-by-zero.
 * - A **project's final score** is the mean of its normalized scores.
 */

export interface WeightedCriterion {
  key: string;
  weight: number;
}

/** The +1 favourite point expressed on the weighted-mean scale. */
export function favoriteBonus(rubric: WeightedCriterion[]): number {
  return rubric.length > 0 ? 1 / rubric.length : 0;
}

/** Weighted mean of one score's criteria marks. Missing marks are skipped. */
export function rawScore(
  criteria: Record<string, number>,
  rubric: WeightedCriterion[],
  favorite = false
): number {
  let weightSum = 0;
  let acc = 0;
  let marked = 0;
  for (const c of rubric) {
    const mark = criteria[c.key];
    if (typeof mark === "number" && !Number.isNaN(mark)) {
      acc += mark * c.weight;
      weightSum += c.weight;
      marked += 1;
    }
  }
  if (weightSum === 0) return 0;
  const bonus = favorite && marked === rubric.length ? favoriteBonus(rubric) : 0;
  return acc / weightSum + bonus;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export interface ScoreRow {
  judgeId: string;
  projectId: string;
  raw: number;
}

export interface NormalizedRow extends ScoreRow {
  z: number;
  normalized: number;
}

/**
 * The global scale the normalized scores are mapped back onto. Using the global
 * mean as the centre and a fixed spread keeps normalized scores on the familiar
 * 1–5 scale and comparable across events. TARGET_SD of 0.9 is roughly the raw
 * spread seen in the fixture data (documented in JUDGING.md).
 */
const TARGET_SD = 0.9;

/**
 * Below this spread a judge counts as "flat". Identical marks produce a
 * floating-point standard deviation of ~1e-16, not exactly 0 — comparing with
 * `> 0` would divide noise by noise and hand that judge arbitrary z-scores.
 */
const FLAT_EPSILON = 1e-9;

export function normalizeScores(rows: ScoreRow[]): NormalizedRow[] {
  const globalMean = mean(rows.map((r) => r.raw));

  // Group by judge to get each judge's own mean and spread.
  const byJudge = new Map<string, ScoreRow[]>();
  for (const r of rows) {
    const list = byJudge.get(r.judgeId) ?? [];
    list.push(r);
    byJudge.set(r.judgeId, list);
  }

  const judgeStats = new Map<string, { mu: number; sd: number }>();
  for (const [judgeId, list] of byJudge) {
    const mu = mean(list.map((r) => r.raw));
    const sd = stddev(
      list.map((r) => r.raw),
      mu
    );
    judgeStats.set(judgeId, { mu, sd });
  }

  return rows.map((r) => {
    const { mu, sd } = judgeStats.get(r.judgeId) ?? { mu: r.raw, sd: 0 };
    // A judge with no spread (marked everything the same) carries no comparative
    // signal: z collapses to 0 and their score becomes the global mean.
    const z = sd > FLAT_EPSILON ? (r.raw - mu) / sd : 0;
    const normalized = clamp(globalMean + z * TARGET_SD, 1, 5);
    return { ...r, z, normalized };
  });
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Per-judge calibration: how many scores, their mean and spread, and a flag an
 * organizer can act on. "flat" is the judge who gave everything the same mark
 * (no ranking signal — normalization maps them to the global mean); "harsh" and
 * "generous" are judges whose mean sits more than 0.5 below/above everyone else.
 */
export function judgeStats(rows: ScoreRow[]) {
  const globalMean = mean(rows.map((r) => r.raw));
  const byJudge = new Map<string, number[]>();
  for (const r of rows) byJudge.set(r.judgeId, [...(byJudge.get(r.judgeId) ?? []), r.raw]);
  return [...byJudge.entries()]
    .map(([judgeId, xs]) => {
      const mu = mean(xs);
      const sd = stddev(xs, mu);
      // One review says nothing about a judge's habits, so flags need at least two.
      const flag: "flat" | "harsh" | "generous" | null =
        xs.length < 2
          ? null
          : sd <= FLAT_EPSILON
            ? "flat"
            : mu < globalMean - 0.5
              ? "harsh"
              : mu > globalMean + 0.5
                ? "generous"
                : null;
      return {
        judgeId,
        count: xs.length,
        mean: mu,
        sd: sd <= FLAT_EPSILON ? 0 : sd,
        offset: mu - globalMean,
        flag,
      };
    })
    .sort((a, b) => a.mean - b.mean);
}

/** Convenience: build the raw rows from DB score records + rubric. */
export function toScoreRows(
  scores: Pick<Score, "judgeId" | "projectId" | "criteria" | "favorite">[],
  rubric: Pick<RubricCriterion, "key" | "weight">[]
): ScoreRow[] {
  return scores.map((s) => ({
    judgeId: s.judgeId,
    projectId: s.projectId,
    raw: rawScore(s.criteria, rubric, s.favorite),
  }));
}
