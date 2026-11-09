import { describe, expect, test } from "bun:test";

import { DEFAULT_RUBRIC } from "@/lib/rubric";

describe("default Innovation Lab rubric", () => {
  test("contains the six approved general criteria", () => {
    expect(DEFAULT_RUBRIC.map((criterion) => criterion.key)).toEqual([
      "strategic_alignment",
      "relevance_coherence",
      "feasibility",
      "solution_clarity",
      "identity",
      "oral_presentation",
    ]);
    expect(DEFAULT_RUBRIC.map((criterion) => criterion.label)).toEqual([
      "Alignement stratégique",
      "Pertinence & cohérence",
      "Faisabilité",
      "Solution claire",
      "Identité",
      "Restitution orale",
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
