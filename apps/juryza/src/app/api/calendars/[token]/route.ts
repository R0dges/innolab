import { and, eq, isNull } from "drizzle-orm";

import { calendarSubscription, db, event, user as userTable } from "@/lib/db";
import { canAccessPersonalCalendar } from "@/lib/schedule";
import { viewerForEvent } from "@/lib/server/events";
import { handle, notFound } from "@/lib/server/http";
import { calendarResponse } from "@/lib/server/ical";
import { hashToken, type Identity } from "@/lib/server/identity";
import { scheduleForEvent } from "@/lib/server/schedule";

type P = { token: string };

export const GET = handle<P>(async (req, { token: tokenWithExtension }) => {
  const token = tokenWithExtension.endsWith(".ics")
    ? tokenWithExtension.slice(0, -4)
    : tokenWithExtension;
  const [row] = await db
    .select({
      subscriptionId: calendarSubscription.id,
      event: event,
      userId: userTable.id,
      role: userTable.role,
      email: userTable.email,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
      location: userTable.location,
      banned: userTable.banned,
    })
    .from(calendarSubscription)
    .innerJoin(event, eq(event.id, calendarSubscription.eventId))
    .innerJoin(userTable, eq(userTable.id, calendarSubscription.userId))
    .where(
      and(
        eq(calendarSubscription.tokenHash, hashToken(token)),
        isNull(calendarSubscription.revokedAt)
      )
    )
    .limit(1);
  if (!row || row.banned) throw notFound("Calendar not found");
  const identity: Identity = {
    userId: row.userId,
    role: row.role as Identity["role"],
    email: row.email,
    name: row.name,
    username: row.username,
    image: row.image,
    location: row.location,
  };
  const viewer = await viewerForEvent(row.event, identity);
  if (!canAccessPersonalCalendar(viewer)) throw notFound("Calendar not found");
  const [items] = await Promise.all([
    scheduleForEvent(row.event.id, viewer, { includeCancelled: true }),
    db
      .update(calendarSubscription)
      .set({ lastUsedAt: new Date() })
      .where(eq(calendarSubscription.id, row.subscriptionId)),
  ]);
  return calendarResponse(req, row.event, items, "private");
});
