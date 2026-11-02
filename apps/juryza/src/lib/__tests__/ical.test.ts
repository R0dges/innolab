import { describe, expect, test } from "bun:test";

import type { ScheduleItem } from "@/lib/db";
import { buildCalendar } from "@/lib/server/ical";

const item: ScheduleItem = {
  id: "sch_test",
  eventId: "evt_test",
  title: "Workshop, security; APIs",
  description: "First line\nSecond line",
  startsAt: new Date("2026-11-02T08:00:00.000Z"),
  endsAt: new Date("2026-11-02T10:00:00.000Z"),
  location: "Room A; Geneva",
  kind: "workshop",
  audience: "participants",
  required: true,
  status: "cancelled",
  revision: 3,
  createdBy: "usr_test",
  createdAt: new Date("2026-10-20T10:00:00.000Z"),
  updatedAt: new Date("2026-10-21T12:00:00.000Z"),
};

describe("iCalendar feed", () => {
  test("keeps stable identities, UTC dates, revisions and cancellations", () => {
    const calendar = buildCalendar({ name: "Innolab Geneva", slug: "innolab-geneva" }, [item]);
    expect(calendar).toContain("UID:sch_test@juryza\r\n");
    expect(calendar).toContain("DTSTART:20261102T080000Z\r\n");
    expect(calendar).toContain("SEQUENCE:3\r\n");
    expect(calendar).toContain("STATUS:CANCELLED\r\n");
    expect(calendar).toContain("CLASS:PRIVATE\r\n");
    expect(calendar).toContain("X-JURYZA-REQUIRED:TRUE\r\n");
  });

  test("escapes text and folds every physical line to 75 UTF-8 octets", () => {
    const calendar = buildCalendar(
      {
        name: "Innovation très détaillée à Genève avec un titre particulièrement long",
        slug: "long",
      },
      [item]
    );
    expect(calendar).toContain("SUMMARY:Workshop\\, security\\; APIs");
    expect(calendar).toContain("DESCRIPTION:First line\\nSecond line");
    expect(calendar).toContain("LOCATION:Room A\\; Geneva");
    for (const line of calendar.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });
});
