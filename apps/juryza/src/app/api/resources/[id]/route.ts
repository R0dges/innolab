import { eq } from "drizzle-orm";

import { db, eventResource } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { resourcePatch } from "@/lib/server/event-workspace";
import { loadManagedEvent } from "@/lib/server/events";
import { handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

type P = { id: string };

export const PATCH = handle<P>(async (req, { id: resourceId }) => {
  const me = await requireUser(req);
  const [resource] = await db
    .select()
    .from(eventResource)
    .where(eq(eventResource.id, resourceId))
    .limit(1);
  if (!resource) throw notFound("Resource not found");
  await loadManagedEvent(resource.eventId, me);
  const body = await readBody(req, resourcePatch);
  await db
    .update(eventResource)
    .set({
      ...body,
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.ownerName !== undefined && { ownerName: body.ownerName?.trim() || null }),
      ...(body.url !== undefined && { url: body.url || null }),
      updatedAt: new Date(),
    })
    .where(eq(eventResource.id, resourceId));
  await audit({
    eventId: resource.eventId,
    actor: me,
    action: "event_resource.updated",
    target: resourceId,
    detail: { fields: Object.keys(body) },
    req,
  });
  return { ok: true };
});

export const DELETE = handle<P>(async (req, { id: resourceId }) => {
  const me = await requireUser(req);
  const [resource] = await db
    .select()
    .from(eventResource)
    .where(eq(eventResource.id, resourceId))
    .limit(1);
  if (!resource) throw notFound("Resource not found");
  await loadManagedEvent(resource.eventId, me);
  await db.delete(eventResource).where(eq(eventResource.id, resourceId));
  await audit({
    eventId: resource.eventId,
    actor: me,
    action: "event_resource.deleted",
    target: resourceId,
    detail: { name: resource.name },
    req,
  });
  return { ok: true };
});
