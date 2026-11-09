import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db, event as eventTable, pitchTieBreakVote } from "@/lib/db";
import { id } from "@/lib/ids";
import { isInnolab, pitchVotingHasClosed } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { isPanelJudge, loadCoachedEvent } from "@/lib/server/events";
import { badRequest, conflict, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

const input = z.object({
  pitchIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const current = await loadCoachedEvent(ref, me);
  if (!isInnolab(current)) throw notFound("This event does not use the Innolab journey");
  if (!pitchVotingHasClosed(current)) {
    throw forbidden("Close pitch voting before coaches resolve a tie");
  }
  const isCoach =
    current.createdBy === me.userId || (await isPanelJudge(current.id, me.userId));
  if (!isCoach) throw forbidden("Only this event's coaches can resolve a pitch tie");

  const body = await readBody(req, input);
  const pitchIds = [...new Set(body.pitchIds)];
  if (pitchIds.length !== body.pitchIds.length) {
    throw badRequest("Choose each tied pitch only once");
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`pitch-selection:${current.id}`}))`
    );
    const [state] = await tx
      .select({
        finalizedAt: eventTable.pitchSelectionFinalizedAt,
        round: eventTable.pitchTieBreakRound,
        candidatePitchIds: eventTable.pitchTieBreakCandidateIds,
        slots: eventTable.pitchTieBreakSlots,
      })
      .from(eventTable)
      .where(eq(eventTable.id, current.id))
      .limit(1);
    if (state?.finalizedAt) throw conflict("The project selection has already been finalized");
    if (!state?.round || !state.slots) throw conflict("No coach tie-break is currently open");
    if (pitchIds.length !== state.slots) {
      throw badRequest(`Choose exactly ${state.slots} tied pitch${state.slots > 1 ? "es" : ""}`);
    }
    if (pitchIds.some((pitchId) => !state.candidatePitchIds.includes(pitchId))) {
      throw badRequest("Choose only pitches included in the current tie");
    }

    const previous = await tx
      .select({ pitchId: pitchTieBreakVote.pitchId })
      .from(pitchTieBreakVote)
      .where(
        and(
          eq(pitchTieBreakVote.eventId, current.id),
          eq(pitchTieBreakVote.round, state.round),
          eq(pitchTieBreakVote.coachId, me.userId)
        )
      );
    await tx
      .delete(pitchTieBreakVote)
      .where(
        and(
          eq(pitchTieBreakVote.eventId, current.id),
          eq(pitchTieBreakVote.round, state.round),
          eq(pitchTieBreakVote.coachId, me.userId)
        )
      );
    await tx.insert(pitchTieBreakVote).values(
      pitchIds.map((pitchId) => ({
        id: id.pitchTieBreakVote(),
        eventId: current.id,
        round: state.round as number,
        pitchId,
        coachId: me.userId,
      }))
    );

    const totals = await tx
      .select({
        pitchId: pitchTieBreakVote.pitchId,
        votes: sql<number>`count(*)::int`,
      })
      .from(pitchTieBreakVote)
      .where(
        and(
          eq(pitchTieBreakVote.eventId, current.id),
          eq(pitchTieBreakVote.round, state.round),
          inArray(pitchTieBreakVote.pitchId, state.candidatePitchIds)
        )
      )
      .groupBy(pitchTieBreakVote.pitchId);
    return {
      round: state.round,
      previousPitchIds: previous.map((row) => row.pitchId),
      totals,
    };
  });

  const changed = result.previousPitchIds.length > 0;
  await audit({
    eventId: current.id,
    actor: me,
    action: changed ? "pitch.tie_break_vote_changed" : "pitch.tie_break_vote_cast",
    target: current.id,
    detail: {
      round: result.round,
      pitchIds,
      ...(changed && { previousPitchIds: result.previousPitchIds }),
    },
    req,
  });
  return {
    voted: true,
    round: result.round,
    pitchIds,
    totals: result.totals,
  };
});
