import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { visibleAnnouncementAudiences } from "@/lib/announcement-audience";
import { announcement, db, user as userTable } from "@/lib/db";
import type { EventViewer } from "@/lib/server/events";

/** Read model shared by the public event response, dashboard, and organizer list. */
export function announcementsForEvent(eventId: string, viewer: EventViewer, limit?: number) {
  const query = db
    .select({
      id: announcement.id,
      eventId: announcement.eventId,
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      audience: announcement.audience,
      pinned: announcement.pinned,
      authorId: announcement.authorId,
      authorName: userTable.name,
      authorImage: userTable.image,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
    })
    .from(announcement)
    .leftJoin(userTable, eq(userTable.id, announcement.authorId))
    .where(
      and(
        eq(announcement.eventId, eventId),
        inArray(announcement.audience, visibleAnnouncementAudiences(viewer))
      )
    )
    .orderBy(
      sql`${announcement.pinned} desc`,
      sql`case ${announcement.priority} when 'urgent' then 0 when 'important' then 1 else 2 end`,
      desc(announcement.createdAt)
    );
  return limit === undefined ? query : query.limit(limit);
}
