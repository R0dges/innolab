import { and, eq } from "drizzle-orm";

import { db, registration } from "@/lib/db";
import { eventRegistrationIsOpen } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { loadEvent, register, teamOf } from "@/lib/server/events";
import { badRequest, forbidden, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

type P = { event: string };

/**
 * POST   /api/events/:event/registration — register for the event.
 * DELETE /api/events/:event/registration — withdraw (leave your team first).
 */

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  if (!eventRegistrationIsOpen(e)) throw forbidden("Registration is closed for this event");
  await register(e.id, me.userId);
  await audit({ eventId: e.id, actor: me, action: "registration.created", req });
  return { registered: true };
});

export const DELETE = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  if (await teamOf(e.id, me.userId)) throw badRequest("Leave your team before withdrawing");
  await db
    .delete(registration)
    .where(and(eq(registration.eventId, e.id), eq(registration.userId, me.userId)));
  await audit({ eventId: e.id, actor: me, action: "registration.withdrawn", req });
  return { registered: false };
});
