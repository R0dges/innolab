import { describe, expect, test } from "bun:test";

import { DEFAULT_RUBRIC } from "@/lib/rubric";

describe("default Innovation Lab rubric", () => {
  test("contains the six approved general criteria", () => {
    expect(DEFAULT_RUBRIC.map((criterion) => criterion.key)).toEqual([
      "strategic_alignment",
      "relevance_coherence",
      "feasibility",
      "solution_clarity",
      "support_quality",
      "oral_presentation",
    ]);
  });

  test("gives every criterion the same weight", () => {
    expect(new Set(DEFAULT_RUBRIC.map((criterion) => criterion.weight))).toEqual(new Set([1]));
  });

  test("uses stable unique keys", () => {
    const keys = DEFAULT_RUBRIC.map((criterion) => criterion.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
