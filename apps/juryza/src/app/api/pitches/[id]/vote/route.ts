import { and, eq } from "drizzle-orm";

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
  if (!pitchVotingIsOpen(event)) throw forbidden("Idea voting is not open");
  const rights = await pitchVoteRights(event.id, me, event.createdBy);
  if (!rights.canVote) throw forbidden("Only registered participants and event coaches can vote");
  const inserted = await db
    .insert(pitchVote)
    .values({ id: id.pitchVote(), pitchId: current.id, voterId: me.userId })
    .onConflictDoNothing()
    .returning({ id: pitchVote.id });
  if (inserted.length > 0) {
    await audit({
      eventId: event.id,
      actor: me,
      action: "pitch.vote_cast",
      target: current.id,
      req,
    });
  }
  return { voted: true, created: inserted.length > 0 };
});

export const DELETE = handle<{ id: string }>(async (req, { id: pitchId }) => {
  const me = await requireUser(req);
  const { pitch: current, event } = await loadPitch(pitchId);
  if (!pitchVotingIsOpen(event)) throw forbidden("Idea voting is not open");
  const rights = await pitchVoteRights(event.id, me, event.createdBy);
  if (!rights.canVote) throw forbidden("Only registered participants and event coaches can vote");
  await db
    .delete(pitchVote)
    .where(and(eq(pitchVote.pitchId, current.id), eq(pitchVote.voterId, me.userId)));
  await audit({
    eventId: event.id,
    actor: me,
    action: "pitch.vote_removed",
    target: current.id,
    req,
  });
  return { voted: false };
});
