import { eq } from "drizzle-orm";

import { db, eventAssistant } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { eventAssistantInput } from "@/lib/server/event-workspace";
import { loadCoachedEvent } from "@/lib/server/events";
import { handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

type P = { event: string };

/** Configure the private assistant link used by one event edition. */
export const PATCH = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadCoachedEvent(ref, me);
  const body = await readBody(req, eventAssistantInput);

  if (body.url === null) {
    await db.delete(eventAssistant).where(eq(eventAssistant.eventId, e.id));
  } else {
    await db
      .insert(eventAssistant)
      .values({
        eventId: e.id,
        url: body.url,
        updatedBy: me.userId,
      })
      .onConflictDoUpdate({
        target: eventAssistant.eventId,
        set: {
          url: body.url,
          updatedBy: me.userId,
          updatedAt: new Date(),
        },
      });
  }

  await audit({
    eventId: e.id,
    actor: me,
    action: body.url === null ? "event_assistant.removed" : "event_assistant.updated",
    target: e.id,
    detail: { configured: body.url !== null },
    req,
  });

  return { assistant: body.url ? { url: body.url } : null };
});
