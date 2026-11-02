import { describe, expect, test } from "bun:test";

import { judgeStats, normalizeScores, rawScore, type ScoreRow, toScoreRows } from "@/lib/scoring";

const rubric = [
  { key: "impact", weight: 0.3 },
  { key: "execution", weight: 0.35 },
  { key: "innovation", weight: 0.2 },
  { key: "presentation", weight: 0.15 },
];

const rows = (judgeId: string, raws: number[]): ScoreRow[] =>
  raws.map((raw, i) => ({ judgeId, projectId: `p${i + 1}`, raw }));

describe("rawScore", () => {
  test("is the weighted mean of the marks", () => {
    expect(
      rawScore({ a: 5, b: 1 }, [
        { key: "a", weight: 3 },
        { key: "b", weight: 1 },
      ])
    ).toBe(4);
    expect(
      rawScore({ impact: 5, execution: 3, innovation: 4, presentation: 4 }, rubric)
    ).toBeCloseTo(3.95, 10);
  });

  test("weights are relative, so scaling them changes nothing", () => {
    const marks = { impact: 2, execution: 5, innovation: 3, presentation: 4 };
    const scaled = rubric.map((c) => ({ ...c, weight: c.weight * 40 }));
    expect(rawScore(marks, scaled)).toBeCloseTo(rawScore(marks, rubric), 12);
  });

  test("missing and NaN marks are skipped and the remaining weights renormalized", () => {
    expect(
      rawScore({ a: 4 }, [
        { key: "a", weight: 1 },
        { key: "b", weight: 3 },
      ])
    ).toBe(4);
    expect(
      rawScore({ a: 4, b: Number.NaN }, [
        { key: "a", weight: 1 },
        { key: "b", weight: 3 },
      ])
    ).toBe(4);
  });

  test("no usable marks scores 0", () => {
    expect(rawScore({}, rubric)).toBe(0);
    expect(rawScore({ other: 5 }, rubric)).toBe(0);
  });

  test("a favourite adds one point to the complete criteria total", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((key) => ({ key, weight: 1 }));
    const marks = Object.fromEntries(six.map(({ key }) => [key, 4]));
    expect(rawScore(marks, six, true)).toBeCloseTo(4 + 1 / 6, 10);
    expect(rawScore(marks, six, false)).toBe(4);
  });

  test("a favourite is not applied to an incomplete evaluation", () => {
    expect(
      rawScore(
        { a: 4 },
        [
          { key: "a", weight: 1 },
          { key: "b", weight: 1 },
        ],
        true
      )
    ).toBe(4);
  });

  test("toScoreRows applies the rubric to DB-shaped records", () => {
    const out = toScoreRows(
      [
        {
          judgeId: "j",
          projectId: "p",
          criteria: { impact: 5, execution: 3, innovation: 4, presentation: 4 },
          favorite: true,
        },
      ],
      rubric
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.raw).toBeCloseTo(3.95 + 0.25, 10);
  });
});

describe("normalizeScores", () => {
  test("converts each judge's scores to z-scores around their own mean", () => {
    const out = normalizeScores(rows("j1", [2, 3, 4]));
    const sd = Math.sqrt(2 / 3);
    expect(out.map((r) => r.z)).toEqual([
      expect.closeTo(-1 / sd, 10),
      0,
      expect.closeTo(1 / sd, 10),
    ]);
    // Global mean 3, spread 0.9.
    expect(out[1]?.normalized).toBeCloseTo(3, 10);
    expect(out[2]?.normalized).toBeCloseTo(3 + (1 / sd) * 0.9, 10);
  });

  test("a harsh and a generous judge with the same ranking produce the same normalized scores", () => {
    const out = normalizeScores([...rows("cold", [1.5, 2.5, 3.5]), ...rows("hot", [3, 4, 5])]);
    for (const p of ["p1", "p2", "p3"]) {
      const [a, b] = out.filter((r) => r.projectId === p);
      expect(a?.normalized).toBeCloseTo(b?.normalized ?? Number.NaN, 10);
    }
  });

  test("a flat judge (float-noisy identical scores) collapses to the global mean", () => {
    const marks = { impact: 5, execution: 3, innovation: 4, presentation: 4 };
    const flatRaw = rawScore(marks, rubric); // 3.95, not exactly representable
    const input = [
      ...rows("flat", [
        flatRaw,
        rawScore({ ...marks }, rubric),
        rawScore({ ...marks }, [...rubric].reverse()),
      ]),
      ...rows("spread", [1, 3, 5]),
    ];
    const globalMean = input.reduce((a, r) => a + r.raw, 0) / input.length;
    const flat = normalizeScores(input).filter((r) => r.judgeId === "flat");
    expect(flat).toHaveLength(3);
    for (const r of flat) {
      expect(r.z).toBe(0);
      expect(r.normalized).toBeCloseTo(globalMean, 10);
    }
  });

  test("normalized scores are clamped to the 1–5 scale", () => {
    const low = [1, 1, 1, 1, 1, 1, 1, 1, 1, 5]; // the 5 is z = +3
    const high = [5, 5, 5, 5, 5, 5, 5, 5, 5, 1]; // the 1 is z = -3
    const mid = [4, 5, 4, 5, 4, 5, 4, 5, 4, 5];
    const out = normalizeScores([...rows("low", low), ...rows("high", high), ...rows("mid", mid)]);
    for (const r of out) {
      expect(r.normalized).toBeGreaterThanOrEqual(1);
      expect(r.normalized).toBeLessThanOrEqual(5);
    }
    expect(out.find((r) => r.judgeId === "low" && r.projectId === "p10")?.normalized).toBe(5);
    expect(out.find((r) => r.judgeId === "high" && r.projectId === "p10")?.normalized).toBe(1);
  });

  test("empty input gives empty output", () => {
    expect(normalizeScores([])).toEqual([]);
  });
});

describe("judgeStats", () => {
  test("flags flat, harsh and generous judges", () => {
    const stats = judgeStats([
      ...rows("flat", [3.95, 3.95, 3.95]),
      ...rows("harsh", [1, 1.5, 2]),
      ...rows("generous", [4.5, 5, 4.8]),
      ...rows("typical", [3, 3.5, 4]),
    ]);
    const flag = (id: string) => stats.find((s) => s.judgeId === id)?.flag;
    expect(flag("flat")).toBe("flat");
    expect(flag("harsh")).toBe("harsh");
    expect(flag("generous")).toBe("generous");
    expect(flag("typical")).toBeNull();
    expect(stats.find((s) => s.judgeId === "flat")?.sd).toBe(0);
  });

  test("a judge with a single review is never flagged", () => {
    const stats = judgeStats([...rows("one", [1]), ...rows("a", [4, 5]), ...rows("b", [4.5, 5])]);
    const one = stats.find((s) => s.judgeId === "one");
    expect(one?.count).toBe(1);
    expect(one?.flag).toBeNull();
  });

  test("reports count, mean, offset and sorts by mean", () => {
    const stats = judgeStats([...rows("a", [4, 5]), ...rows("b", [2, 3])]);
    expect(stats.map((s) => s.judgeId)).toEqual(["b", "a"]);
    expect(stats[1]).toMatchObject({ count: 2, mean: 4.5, offset: 1 });
    expect(stats[0]?.offset).toBe(-1);
  });
});
