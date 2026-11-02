import { describe, expect, test } from "bun:test";

import { visibleAnnouncementAudiences } from "@/lib/announcement-audience";

describe("announcement audiences", () => {
  test("anonymous visitors only see public communications", () => {
    expect(visibleAnnouncementAudiences(null)).toEqual(["all"]);
  });

  test("participants and coaches receive only their targeted communications", () => {
    expect(
      visibleAnnouncementAudiences({ registered: true, isJudge: false, canManage: false })
    ).toEqual(["all", "participants"]);
    expect(
      visibleAnnouncementAudiences({ registered: false, isJudge: true, canManage: false })
    ).toEqual(["all", "coaches"]);
  });

  test("an event organizer can review every audience", () => {
    expect(
      visibleAnnouncementAudiences({ registered: false, isJudge: false, canManage: true })
    ).toEqual(["all", "participants", "coaches", "organizers"]);
  });
});
