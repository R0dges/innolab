import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, pitch } from "@/lib/db";
import { pitchSubmissionsAreOpen } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { loadPitch } from "@/lib/server/pitches";

const patchInput = z.object({
  title: z.string().trim().min(3).max(100).optional(),
  description: z.string().trim().min(10).max(3000).optional(),
  submit: z.literal(true).optional(),
});

export const PATCH = handle<{ id: string }>(async (req, { id: pitchId }) => {
  const me = await requireUser(req);
  const { pitch: current, event } = await loadPitch(pitchId);
  if (current.authorId !== me.userId) throw forbidden("Only the pitch author can edit it");
  if (current.status !== "draft") throw forbidden("A submitted pitch can no longer be edited");
  if (!pitchSubmissionsAreOpen(event)) throw forbidden("Idea submissions are closed");
  const body = await readBody(req, patchInput);
  await db
    .update(pitch)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.submit && { status: "submitted", submittedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(eq(pitch.id, current.id));
  await audit({
    eventId: event.id,
    actor: me,
    action: body.submit ? "pitch.submitted" : "pitch.updated",
    target: current.id,
    req,
  });
  const [updated] = await db.select().from(pitch).where(eq(pitch.id, current.id));
  return { pitch: updated };
});

export const DELETE = handle<{ id: string }>(async (req, { id: pitchId }) => {
  const me = await requireUser(req);
  const { pitch: current, event } = await loadPitch(pitchId);
  if (current.authorId !== me.userId) throw forbidden("Only the pitch author can delete it");
  if (current.status !== "draft") throw forbidden("A submitted pitch is kept with the event");
  if (!pitchSubmissionsAreOpen(event)) throw forbidden("Idea submissions are closed");
  await db.delete(pitch).where(eq(pitch.id, current.id));
  await audit({
    eventId: event.id,
    actor: me,
    action: "pitch.deleted",
    target: current.id,
    detail: { title: current.title },
    req,
  });
  return { ok: true };
});
