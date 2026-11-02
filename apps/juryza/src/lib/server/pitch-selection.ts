import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db, eventJudge, pitch, registration, user as userTable } from "@/lib/db";

export const MIN_PROJECT_MEMBERS = 5;
export const MAX_PROJECT_MEMBERS = 6;
export const PITCH_SELECTION_ALGORITHM = "votes-desc-sha256-tie-v1";

export type PitchSelectionCandidate = {
  id: string;
  authorId: string;
  votes: number;
};

export function recommendedProjectRange(participantCount: number) {
  if (participantCount <= 0) return { minimum: 0, maximum: 0 };
  const minimum = Math.ceil(participantCount / MAX_PROJECT_MEMBERS);
  return {
    minimum,
    maximum: Math.max(minimum, Math.floor(participantCount / MIN_PROJECT_MEMBERS)),
  };
}

function tieBreakKey(seed: string, pitchId: string) {
  return createHash("sha256").update(`${seed}:${pitchId}`).digest("hex");
}

export function selectRankedPitches<Candidate extends PitchSelectionCandidate>(
  candidates: Candidate[],
  count: number,
  seed: string
) {
  if (!Number.isInteger(count) || count < 1 || count > candidates.length) {
    throw new RangeError("The requested pitch count is outside the available candidates");
  }

  const ranked = candidates.toSorted(
    (left, right) =>
      right.votes - left.votes ||
      tieBreakKey(seed, left.id).localeCompare(tieBreakKey(seed, right.id)) ||
      left.id.localeCompare(right.id)
  );
  const selected = ranked.slice(0, count);
  const cutoffVotes = selected.at(-1)?.votes ?? 0;
  const candidatesAtCutoff = ranked.filter((candidate) => candidate.votes === cutoffVotes);
  const selectedAtCutoff = selected.filter((candidate) => candidate.votes === cutoffVotes);
  const tieAtCutoff = candidatesAtCutoff.length > selectedAtCutoff.length;

  return {
    ranked,
    selected,
    selectedIds: selected.map((candidate) => candidate.id),
    cutoffVotes,
    tieCandidateIds: tieAtCutoff ? candidatesAtCutoff.map((candidate) => candidate.id) : [],
    tieSelectedIds: tieAtCutoff ? selectedAtCutoff.map((candidate) => candidate.id) : [],
  };
}

export async function pitchSelectionOverview(eventId: string) {
  const [[participants], [candidates]] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(registration)
      .innerJoin(userTable, eq(userTable.id, registration.userId))
      .leftJoin(
        eventJudge,
        and(
          eq(eventJudge.eventId, registration.eventId),
          eq(eventJudge.userId, registration.userId)
        )
      )
      .where(
        and(
          eq(registration.eventId, eventId),
          eq(userTable.role, "participant"),
          isNull(eventJudge.userId)
        )
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(pitch)
      .where(and(eq(pitch.eventId, eventId), eq(pitch.status, "submitted"))),
  ]);
  const participantCount = participants?.value ?? 0;
  return {
    participantCount,
    candidateCount: candidates?.value ?? 0,
    recommended: recommendedProjectRange(participantCount),
  };
}
