import { describe, expect, test } from "bun:test";

import { visibleScheduleAudiences } from "@/lib/schedule";

describe("schedule audiences", () => {
  test("anonymous visitors only see public activities", () => {
    expect(visibleScheduleAudiences(null)).toEqual(["all"]);
  });

  test("participants and coaches receive only their targeted activities", () => {
    expect(
      visibleScheduleAudiences({ registered: true, isJudge: false, canManage: false })
    ).toEqual(["all", "participants"]);
    expect(
      visibleScheduleAudiences({ registered: false, isJudge: true, canManage: false })
    ).toEqual(["all", "coaches"]);
  });

  test("event managers can review every audience", () => {
    expect(
      visibleScheduleAudiences({ registered: false, isJudge: false, canManage: true })
    ).toEqual(["all", "participants", "coaches", "organizers"]);
  });
});
