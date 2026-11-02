import { createHash } from "node:crypto";

import type { Event, ScheduleItem } from "@/lib/db";
import { SCHEDULE_KIND_LABELS, type ScheduleKind } from "@/lib/schedule";

const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 content lines are folded at 75 UTF-8 octets, continuation space included. */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  for (const character of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (current && encoder.encode(current + character).length > limit) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export function buildCalendar(event: Pick<Event, "name" | "slug">, items: ScheduleItem[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Juryza//Innovation Lab Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(event.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@juryza`,
      `DTSTAMP:${utc(item.updatedAt)}`,
      `CREATED:${utc(item.createdAt)}`,
      `LAST-MODIFIED:${utc(item.updatedAt)}`,
      `DTSTART:${utc(item.startsAt)}`,
      `DTEND:${utc(item.endsAt)}`,
      `SEQUENCE:${item.revision}`,
      `STATUS:${item.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      `SUMMARY:${escapeText(item.title)}`,
      `CATEGORIES:${escapeText(SCHEDULE_KIND_LABELS[item.kind as ScheduleKind] ?? "Other")}`,
      `CLASS:${item.audience === "all" ? "PUBLIC" : "PRIVATE"}`,
      `X-JURYZA-AUDIENCE:${item.audience.toUpperCase()}`,
      `X-JURYZA-REQUIRED:${item.required ? "TRUE" : "FALSE"}`
    );
    if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function calendarResponse(
  request: Request,
  event: Pick<Event, "name" | "slug">,
  items: ScheduleItem[],
  privacy: "public" | "private"
): Response {
  const content = buildCalendar(event, items);
  const etag = `"${createHash("sha256").update(content).digest("hex")}"`;
  const headers = new Headers({
    "Cache-Control": `${privacy}, max-age=300, must-revalidate`,
    "Content-Disposition": `inline; filename="${event.slug}-calendar.ics"`,
    "Content-Type": "text/calendar; charset=utf-8",
    ETag: etag,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  return new Response(content, { headers });
}
