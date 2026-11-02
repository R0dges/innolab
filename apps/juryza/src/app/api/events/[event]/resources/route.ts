import { asc, eq, sql } from "drizzle-orm";

import { db, eventResource } from "@/lib/db";
import { id } from "@/lib/ids";
import { audit } from "@/lib/server/audit";
import { canAccessEventWorkspace, resourceInput } from "@/lib/server/event-workspace";
import { loadEvent, loadManagedEvent, viewerForEvent } from "@/lib/server/events";
import { created, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";

type P = { event: string };

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  if (!canAccessEventWorkspace(viewer)) {
    throw forbidden("Register for this event to access its operational resources");
  }
  return {
    resources: await db
      .select()
      .from(eventResource)
      .where(eq(eventResource.eventId, e.id))
      .orderBy(
        sql`case ${eventResource.kind} when 'scope' then 0 when 'accessible' then 1 else 2 end`,
        asc(eventResource.position),
        asc(eventResource.name)
      ),
  };
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const body = await readBody(req, resourceInput);
  const resourceId = id.eventResource();
  await db.insert(eventResource).values({
    id: resourceId,
    eventId: e.id,
    kind: body.kind,
    name: body.name,
    category: body.category,
    description: body.description?.trim() || null,
    url: body.url || null,
    accessLevel: body.accessLevel,
    availability: body.availability,
    ownerName: body.ownerName?.trim() || null,
    position: body.position,
    createdBy: me.userId,
  });
  await audit({
    eventId: e.id,
    actor: me,
    action: "event_resource.created",
    target: resourceId,
    detail: { kind: body.kind, name: body.name },
    req,
  });
  return created({ id: resourceId });
});
