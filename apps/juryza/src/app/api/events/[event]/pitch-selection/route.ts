import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { db, pitch, project } from "@/lib/db";
import { isInnolab, pitchVotingHasClosed } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { loadManagedEvent } from "@/lib/server/events";
import { badRequest, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

const input = z.object({ pitchIds: z.array(z.string().min(1)).min(1).max(6) });

export const POST = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const event = await loadManagedEvent(ref, me);
  if (!isInnolab(event)) throw notFound("This event does not use the Innolab journey");
  if (!pitchVotingHasClosed(event)) throw forbidden("Close idea voting before selecting pitches");
  const body = await readBody(req, input);
  const selectedIds = [...new Set(body.pitchIds)];
  if (selectedIds.length !== body.pitchIds.length)
    throw badRequest("A pitch can only be selected once");

  const candidates = await db
    .select({ id: pitch.id })
    .from(pitch)
    .where(and(eq(pitch.eventId, event.id), ne(pitch.status, "draft")));
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  if (selectedIds.some((pitchId) => !candidateIds.has(pitchId))) {
    throw badRequest("Every selected pitch must be a submitted pitch from this event");
  }
  const minimum = Math.min(5, candidates.length);
  const maximum = Math.min(6, candidates.length);
  if (selectedIds.length < minimum || selectedIds.length > maximum) {
    throw badRequest(
      candidates.length < 5
        ? `Select all ${candidates.length} submitted pitches`
        : "Select 5 or 6 pitches"
    );
  }

  const linked = await db
    .select({ pitchId: project.pitchId })
    .from(project)
    .where(and(eq(project.eventId, event.id), inArray(project.pitchId, [...candidateIds])));
  const linkedIds = linked.flatMap((row) => (row.pitchId ? [row.pitchId] : []));
  if (linkedIds.some((pitchId) => !selectedIds.includes(pitchId))) {
    throw badRequest("A pitch with an existing project must remain selected");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(pitch)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(pitch.eventId, event.id), ne(pitch.status, "draft")));
    await tx
      .update(pitch)
      .set({ status: "selected", updatedAt: new Date() })
      .where(inArray(pitch.id, selectedIds));
  });
  await audit({
    eventId: event.id,
    actor: me,
    action: "pitch.selection_updated",
    target: event.id,
    detail: { pitchIds: selectedIds },
    req,
  });
  return { selected: selectedIds };
});
