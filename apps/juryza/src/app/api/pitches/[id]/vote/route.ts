import { and, eq, sql } from "drizzle-orm";

import { db, pitchVote } from "@/lib/db";
import { id } from "@/lib/ids";
import { pitchVotingIsOpen } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { forbidden, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { loadPitch, pitchVoteRights } from "@/lib/server/pitches";

export const POST = handle<{ id: string }>(async (req, { id: pitchId }) => {
  const me = await requireUser(req);
  const { pitch: current, event } = await loadPitch(pitchId);
  if (current.status !== "submitted") throw forbidden("Only submitted pitches can receive votes");
  if (!event.pitchPresentationOpenedAt) {
    throw forbidden("Pitch voting starts after a coach opens the presentation session");
  }
  if (!pitchVotingIsOpen(event)) throw forbidden("Idea voting is not open");
  const rights = await pitchVoteRights(event.id, me, event.createdBy);
  if (!rights.canVote) {
    throw forbidden("Only registered participants who are not coaches or managers can vote");
  }
  if (current.authorId === me.userId) throw forbidden("You cannot vote for your own pitch");

  const previousPitchId = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`pitch-vote:${event.id}:${me.userId}`}))`
    );
    const [previous] = await tx
      .select({ pitchId: pitchVote.pitchId })
      .from(pitchVote)
      .where(and(eq(pitchVote.eventId, event.id), eq(pitchVote.voterId, me.userId)))
      .limit(1);
    if (previous?.pitchId === current.id) return current.id;
    await tx
      .insert(pitchVote)
      .values({
        id: id.pitchVote(),
        eventId: event.id,
        pitchId: current.id,
        voterId: me.userId,
      })
      .onConflictDoUpdate({
        target: [pitchVote.eventId, pitchVote.voterId],
        set: { pitchId: current.id, createdAt: new Date() },
      });
    return previous?.pitchId ?? null;
  });

  const changed = previousPitchId !== null && previousPitchId !== current.id;
  if (previousPitchId !== current.id) {
    await audit({
      eventId: event.id,
      actor: me,
      action: changed ? "pitch.vote_changed" : "pitch.vote_cast",
      target: current.id,
      detail: changed ? { previousPitchId } : undefined,
      req,
    });
  }
  return { voted: true, created: previousPitchId === null, changed };
});

export const DELETE = handle<{ id: string }>(async (req, { id: pitchId }) => {
  const me = await requireUser(req);
  const { pitch: current, event } = await loadPitch(pitchId);
  if (!event.pitchPresentationOpenedAt) {
    throw forbidden("Pitch voting starts after a coach opens the presentation session");
  }
  if (!pitchVotingIsOpen(event)) throw forbidden("Idea voting is not open");
  const rights = await pitchVoteRights(event.id, me, event.createdBy);
  if (!rights.canVote) {
    throw forbidden("Only registered participants who are not coaches or managers can vote");
  }
  const removed = await db
    .delete(pitchVote)
    .where(
      and(
        eq(pitchVote.eventId, event.id),
        eq(pitchVote.pitchId, current.id),
        eq(pitchVote.voterId, me.userId)
      )
    )
    .returning({ id: pitchVote.id });
  if (removed.length > 0) {
    await audit({
      eventId: event.id,
      actor: me,
      action: "pitch.vote_removed",
      target: current.id,
      req,
    });
  }
  return { voted: false };
});
