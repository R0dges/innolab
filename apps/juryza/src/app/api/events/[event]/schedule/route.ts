import { eq } from "drizzle-orm";

import { db, scheduleItem } from "@/lib/db";
import { id } from "@/lib/ids";
import { audit } from "@/lib/server/audit";
import { loadEvent, loadManagedEvent, viewerForEvent } from "@/lib/server/events";
import { created, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { scheduleForEvent, scheduleItemInput } from "@/lib/server/schedule";

type P = { event: string };

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  return {
    schedule: await scheduleForEvent(e.id, viewer, {
      includeCancelled: Boolean(viewer?.canManage),
    }),
  };
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const body = await readBody(req, scheduleItemInput);
  const itemId = id.scheduleItem();
  await db.insert(scheduleItem).values({
    id: itemId,
    eventId: e.id,
    title: body.title,
    description: body.description?.trim() || null,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    location: body.location?.trim() || null,
    kind: body.kind,
    audience: body.audience,
    required: body.required,
    status: body.status,
    createdBy: me.userId,
  });
  await audit({
    eventId: e.id,
    actor: me,
    action: "schedule_item.created",
    target: itemId,
    detail: { title: body.title, audience: body.audience },
    req,
  });
  const [item] = await db.select().from(scheduleItem).where(eq(scheduleItem.id, itemId)).limit(1);
  return created({ item });
});
