import { and, eq } from "drizzle-orm";

import { calendarSubscription, db } from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { canAccessPersonalCalendar } from "@/lib/schedule";
import { audit } from "@/lib/server/audit";
import { loadEvent, viewerForEvent } from "@/lib/server/events";
import { created, forbidden, handle } from "@/lib/server/http";
import { hashToken, requireUser } from "@/lib/server/identity";

type P = { event: string };

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  if (!canAccessPersonalCalendar(viewer))
    throw forbidden("Join this event to subscribe to its calendar");
  const [subscription] = await db
    .select({
      id: calendarSubscription.id,
      prefix: calendarSubscription.prefix,
      createdAt: calendarSubscription.createdAt,
      lastUsedAt: calendarSubscription.lastUsedAt,
      revokedAt: calendarSubscription.revokedAt,
    })
    .from(calendarSubscription)
    .where(and(eq(calendarSubscription.eventId, e.id), eq(calendarSubscription.userId, me.userId)))
    .limit(1);
  return { subscription: subscription?.revokedAt ? null : (subscription ?? null) };
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  if (!canAccessPersonalCalendar(viewer))
    throw forbidden("Join this event to subscribe to its calendar");
  const token = `jzcal_${secretToken(48)}`;
  const subscriptionId = id.calendarSubscription();
  const [subscription] = await db
    .insert(calendarSubscription)
    .values({
      id: subscriptionId,
      eventId: e.id,
      userId: me.userId,
      tokenHash: hashToken(token),
      prefix: token.slice(0, 12),
    })
    .onConflictDoUpdate({
      target: [calendarSubscription.eventId, calendarSubscription.userId],
      set: {
        tokenHash: hashToken(token),
        prefix: token.slice(0, 12),
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      },
    })
    .returning({ id: calendarSubscription.id });
  await audit({
    eventId: e.id,
    actor: me,
    action: "calendar_subscription.rotated",
    target: subscription?.id ?? subscriptionId,
    req,
  });
  const url = new URL(`/api/calendars/${token}.ics`, req.url).toString();
  return created({ url, prefix: token.slice(0, 12) });
});

export const DELETE = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  await db
    .update(calendarSubscription)
    .set({ revokedAt: new Date() })
    .where(and(eq(calendarSubscription.eventId, e.id), eq(calendarSubscription.userId, me.userId)));
  await audit({ eventId: e.id, actor: me, action: "calendar_subscription.revoked", req });
  return { ok: true };
});
