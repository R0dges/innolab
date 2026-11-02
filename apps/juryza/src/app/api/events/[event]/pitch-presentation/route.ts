import { and, eq, isNull } from "drizzle-orm";

import { db, event as eventTable } from "@/lib/db";
import { isInnolab } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { loadCoachedEvent } from "@/lib/server/events";
import { forbidden, handle, notFound } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

export const POST = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const current = await loadCoachedEvent(ref, me);
  if (!isInnolab(current)) throw notFound("This event does not use the Innolab journey");
  if (!current.pitchSubmissionsClose || Date.now() < current.pitchSubmissionsClose.getTime()) {
    throw forbidden("Close pitch submissions before opening the presentation session");
  }

  const now = new Date();
  const [opened] = await db
    .update(eventTable)
    .set({ pitchPresentationOpenedAt: now, updatedAt: now })
    .where(and(eq(eventTable.id, current.id), isNull(eventTable.pitchPresentationOpenedAt)))
    .returning({ openedAt: eventTable.pitchPresentationOpenedAt });
  const openedAt = opened?.openedAt ?? current.pitchPresentationOpenedAt;

  if (opened) {
    await audit({
      eventId: current.id,
      actor: me,
      action: "pitch.presentation_opened",
      target: current.id,
      detail: { openedAt: openedAt?.toISOString() },
      req,
    });
  }

  return { openedAt, created: Boolean(opened) };
});
