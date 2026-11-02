import { describe, expect, test } from "bun:test";

import { recommendedProjectRange, selectRankedPitches } from "@/lib/server/pitch-selection";

describe("recommendedProjectRange", () => {
  test("recommends six or seven projects for 36 participants", () => {
    expect(recommendedProjectRange(36)).toEqual({ minimum: 6, maximum: 7 });
  });

  test("keeps a feasible single recommendation when the division is exact", () => {
    expect(recommendedProjectRange(38)).toEqual({ minimum: 7, maximum: 7 });
  });

  test("handles small and empty sessions", () => {
    expect(recommendedProjectRange(3)).toEqual({ minimum: 1, maximum: 1 });
    expect(recommendedProjectRange(0)).toEqual({ minimum: 0, maximum: 0 });
  });
});

describe("selectRankedPitches", () => {
  const candidates = [
    { id: "pitch-a", authorId: "author-a", votes: 5 },
    { id: "pitch-b", authorId: "author-b", votes: 3 },
    { id: "pitch-c", authorId: "author-c", votes: 3 },
    { id: "pitch-d", authorId: "author-d", votes: 3 },
    { id: "pitch-e", authorId: "author-e", votes: 1 },
  ];

  test("keeps higher vote totals and only draws at the cutoff tie", () => {
    const result = selectRankedPitches(candidates, 3, "auditable-seed");
    expect(result.selectedIds).toHaveLength(3);
    expect(result.selectedIds[0]).toBe("pitch-a");
    expect(result.tieCandidateIds).toEqual(
      expect.arrayContaining(["pitch-b", "pitch-c", "pitch-d"])
    );
    expect(result.tieSelectedIds).toHaveLength(2);
  });

  test("is reproducible for the same seed", () => {
    expect(selectRankedPitches(candidates, 3, "same-seed").selectedIds).toEqual(
      selectRankedPitches(candidates, 3, "same-seed").selectedIds
    );
  });

  test("rejects a quota outside the available pitches", () => {
    expect(() => selectRankedPitches(candidates, 0, "seed")).toThrow(RangeError);
    expect(() => selectRankedPitches(candidates, 6, "seed")).toThrow(RangeError);
  });
});
