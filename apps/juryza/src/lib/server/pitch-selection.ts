import { and, eq, isNull, sql } from "drizzle-orm";

import { db, eventJudge, pitch, registration, user as userTable } from "@/lib/db";

export const MIN_PROJECT_MEMBERS = 5;
export const MAX_PROJECT_MEMBERS = 6;
export const PITCH_SELECTION_ALGORITHM = "participant-votes-desc-coach-runoff-v2";

export type PitchSelectionCandidate = {
  id: string;
  authorId: string;
  votes: number;
  createdAt: Date;
};

export function recommendedProjectRange(participantCount: number) {
  if (participantCount <= 0) return { minimum: 0, maximum: 0 };
  const minimum = Math.ceil(participantCount / MAX_PROJECT_MEMBERS);
  return {
    minimum,
    maximum: Math.max(minimum, Math.floor(participantCount / MIN_PROJECT_MEMBERS)),
  };
}

export function selectRankedPitches<Candidate extends PitchSelectionCandidate>(
  candidates: Candidate[],
  count: number
) {
  if (!Number.isInteger(count) || count < 1 || count > candidates.length) {
    throw new RangeError("The requested pitch count is outside the available candidates");
  }

  const ranked = candidates.toSorted(
    (left, right) =>
      right.votes - left.votes ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id)
  );
  const cutoffVotes = ranked[count - 1]?.votes ?? 0;
  const selectedBeforeCutoff = ranked.filter((candidate) => candidate.votes > cutoffVotes);
  const candidatesAtCutoff = ranked.filter((candidate) => candidate.votes === cutoffVotes);
  const slotsAtCutoff = count - selectedBeforeCutoff.length;
  const tieAtCutoff = candidatesAtCutoff.length > slotsAtCutoff;
  const selected = tieAtCutoff ? selectedBeforeCutoff : ranked.slice(0, count);

  return {
    ranked,
    selected,
    selectedIds: selected.map((candidate) => candidate.id),
    cutoffVotes,
    tieCandidateIds: tieAtCutoff ? candidatesAtCutoff.map((candidate) => candidate.id) : [],
    tieSlots: tieAtCutoff ? slotsAtCutoff : 0,
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
