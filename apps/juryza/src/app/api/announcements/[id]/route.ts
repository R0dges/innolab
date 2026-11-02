import { eq } from "drizzle-orm";
import { z } from "zod";

import { announcement, db } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { loadManagedEvent } from "@/lib/server/events";
import { handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { richDoc } from "@/lib/server/validation";

const patchBody = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    body: z.union([z.string().trim().min(1), richDoc]).optional(),
    priority: z.enum(["normal", "important", "urgent"]).optional(),
    audience: z.enum(["all", "participants", "coaches", "organizers"]).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

/** PATCH /api/announcements/:id — edit an organizer communication. */
export const PATCH = handle<{ id: string }>(async (req, { id: annId }) => {
  const me = await requireUser(req);
  const [a] = await db.select().from(announcement).where(eq(announcement.id, annId)).limit(1);
  if (!a) throw notFound("Announcement not found");
  await loadManagedEvent(a.eventId, me);
  const body = await readBody(req, patchBody);
  const { body: announcementBody, ...fields } = body;
  await db
    .update(announcement)
    .set({
      ...fields,
      ...(announcementBody !== undefined && {
        body:
          typeof announcementBody === "string"
            ? announcementBody
            : JSON.stringify(announcementBody),
      }),
      updatedAt: new Date(),
    })
    .where(eq(announcement.id, annId));
  await audit({
    eventId: a.eventId,
    actor: me,
    action: "announcement.updated",
    target: annId,
    detail: { fields: Object.keys(body) },
    req,
  });
  return { ok: true };
});

/** DELETE /api/announcements/:id — remove an announcement (the event's organizers). */
export const DELETE = handle<{ id: string }>(async (req, { id: annId }) => {
  const me = await requireUser(req);
  const [a] = await db.select().from(announcement).where(eq(announcement.id, annId)).limit(1);
  if (!a) throw notFound("Announcement not found");
  await loadManagedEvent(a.eventId, me);
  await db.delete(announcement).where(eq(announcement.id, annId));
  await audit({
    eventId: a.eventId,
    actor: me,
    action: "announcement.deleted",
    target: annId,
    req,
  });
  return { ok: true };
});
