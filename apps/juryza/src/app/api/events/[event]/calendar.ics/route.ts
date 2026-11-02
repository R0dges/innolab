import { and, eq } from "drizzle-orm";

import { db, event, scheduleItem } from "@/lib/db";
import { calendarResponse } from "@/lib/server/ical";
import { handle, notFound } from "@/lib/server/http";

type P = { event: string };

/** Public feed: deliberately contains only public activities from a published event. */
export const GET = handle<P>(async (req, { event: ref }) => {
  const [e] = await db.select().from(event).where(eq(event.slug, ref)).limit(1);
  if (e?.visibility !== "published") throw notFound("Event not found");
  const items = await db
    .select()
    .from(scheduleItem)
    .where(and(eq(scheduleItem.eventId, e.id), eq(scheduleItem.audience, "all")));
  return calendarResponse(req, e, items, "public");
});
