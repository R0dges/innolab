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
  const candidates = (votes: number[]) =>
    votes.map((voteCount, index) => ({
      id: `pitch-${index + 1}`,
      authorId: `author-${index + 1}`,
      votes: voteCount,
      createdAt: new Date(`2026-01-0${index + 1}T09:00:00.000Z`),
    }));

  test("selects the displayed leader for a 1-0 result", () => {
    const result = selectRankedPitches(candidates([1, 0]), 1);
    expect(result.ranked.map((candidate) => candidate.id)).toEqual(["pitch-1", "pitch-2"]);
    expect(result.selectedIds).toEqual(["pitch-1"]);
    expect(result.tieCandidateIds).toEqual([]);
  });

  test("selects the first two displayed pitches for a 2-1-0 result", () => {
    const result = selectRankedPitches(candidates([2, 1, 0]), 2);
    expect(result.ranked.map((candidate) => candidate.id)).toEqual([
      "pitch-1",
      "pitch-2",
      "pitch-3",
    ]);
    expect(result.selectedIds).toEqual(["pitch-1", "pitch-2"]);
    expect(result.tieCandidateIds).toEqual([]);
  });

  test("keeps the two-vote pitch when five of six pitches are promoted", () => {
    const result = selectRankedPitches(candidates([2, 1, 1, 1, 1, 0]), 5);
    expect(result.selectedIds).toEqual(["pitch-1", "pitch-2", "pitch-3", "pitch-4", "pitch-5"]);
    expect(result.tieCandidateIds).toEqual([]);
  });

  test("requires a coach runoff when an equality crosses the cutoff", () => {
    const result = selectRankedPitches(candidates([2, 1, 1, 0]), 2);
    expect(result.selectedIds).toEqual(["pitch-1"]);
    expect(result.tieCandidateIds).toEqual(["pitch-2", "pitch-3"]);
    expect(result.tieSlots).toBe(1);
  });

  test("does not require a runoff when all tied pitches fit", () => {
    const result = selectRankedPitches(candidates([2, 1, 1, 0]), 3);
    expect(result.selectedIds).toEqual(["pitch-1", "pitch-2", "pitch-3"]);
    expect(result.tieCandidateIds).toEqual([]);
  });

  test("rejects a quota outside the available pitches", () => {
    const available = candidates([2, 1, 0]);
    expect(() => selectRankedPitches(available, 0)).toThrow(RangeError);
    expect(() => selectRankedPitches(available, 4)).toThrow(RangeError);
  });
});
