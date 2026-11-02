import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, scheduleItem } from "@/lib/db";
import {
  SCHEDULE_AUDIENCES,
  SCHEDULE_KINDS,
  type ScheduleViewer,
  visibleScheduleAudiences,
} from "@/lib/schedule";
import { badRequest } from "@/lib/server/http";

const optionalText = (max: number) => z.string().trim().max(max).nullish();

const scheduleFields = z.object({
  title: z.string().trim().min(2).max(140),
  description: optionalText(4000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  location: optionalText(200),
  kind: z.enum(SCHEDULE_KINDS).default("other"),
  audience: z.enum(SCHEDULE_AUDIENCES).default("all"),
  required: z.boolean().default(false),
  status: z.enum(["scheduled", "cancelled"]).default("scheduled"),
});

export const scheduleItemInput = scheduleFields.superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
  }
});

export const scheduleItemPatch = scheduleFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export function assertScheduleRange(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) throw badRequest("End must be after start");
}

export async function scheduleForEvent(
  eventId: string,
  viewer: ScheduleViewer | null,
  options: { includeCancelled?: boolean } = {}
) {
  const audiences = visibleScheduleAudiences(viewer);
  return db
    .select()
    .from(scheduleItem)
    .where(
      and(
        eq(scheduleItem.eventId, eventId),
        inArray(scheduleItem.audience, audiences),
        options.includeCancelled ? undefined : eq(scheduleItem.status, "scheduled")
      )
    )
    .orderBy(asc(scheduleItem.startsAt), asc(scheduleItem.endsAt), asc(scheduleItem.title));
}
