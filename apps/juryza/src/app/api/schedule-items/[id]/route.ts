import { eq, sql } from "drizzle-orm";

import { db, scheduleItem } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { loadManagedEvent } from "@/lib/server/events";
import { handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { assertScheduleRange, scheduleItemPatch } from "@/lib/server/schedule";

type P = { id: string };

export const PATCH = handle<P>(async (req, { id: itemId }) => {
  const me = await requireUser(req);
  const [item] = await db.select().from(scheduleItem).where(eq(scheduleItem.id, itemId)).limit(1);
  if (!item) throw notFound("Schedule item not found");
  await loadManagedEvent(item.eventId, me);
  const body = await readBody(req, scheduleItemPatch);
  const startsAt = body.startsAt ?? item.startsAt;
  const endsAt = body.endsAt ?? item.endsAt;
  assertScheduleRange(startsAt, endsAt);
  await db
    .update(scheduleItem)
    .set({
      ...body,
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.location !== undefined && { location: body.location?.trim() || null }),
      revision: sql`${scheduleItem.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(scheduleItem.id, itemId));
  await audit({
    eventId: item.eventId,
    actor: me,
    action: "schedule_item.updated",
    target: itemId,
    detail: { fields: Object.keys(body) },
    req,
  });
  return { ok: true };
});

export const DELETE = handle<P>(async (req, { id: itemId }) => {
  const me = await requireUser(req);
  const [item] = await db.select().from(scheduleItem).where(eq(scheduleItem.id, itemId)).limit(1);
  if (!item) throw notFound("Schedule item not found");
  await loadManagedEvent(item.eventId, me);
  await db
    .update(scheduleItem)
    .set({
      status: "cancelled",
      revision: sql`${scheduleItem.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(scheduleItem.id, itemId));
  await audit({
    eventId: item.eventId,
    actor: me,
    action: "schedule_item.cancelled",
    target: itemId,
    detail: { title: item.title },
    req,
  });
  return { ok: true };
});
