import { describe, expect, test } from "bun:test";

import {
  eventRegistrationIsOpen,
  innolabProjectFormationIsOpen,
  pitchSubmissionsAreOpen,
  pitchVotingHasClosed,
  pitchVotingIsOpen,
} from "@/lib/innolab";

const at = (hours: number) => new Date(1_800_000_000_000 + hours * 3_600_000).toISOString();
const NOW = new Date(at(0)).getTime();
const event = {
  workflow: "innolab",
  pitchSubmissionsOpen: at(-48),
  pitchSubmissionsClose: at(-2),
  pitchVotingOpen: at(-1),
  pitchVotingClose: at(1),
  submissionsOpen: at(2),
  submissionsClose: at(72),
};

describe("Innolab phases", () => {
  test("keeps pitch submission, pitch voting and project formation separate", () => {
    expect(pitchSubmissionsAreOpen(event, NOW)).toBe(false);
    expect(pitchVotingIsOpen(event, NOW)).toBe(true);
    expect(pitchVotingHasClosed(event, NOW)).toBe(false);
    expect(innolabProjectFormationIsOpen(event, NOW)).toBe(false);

    const projectTime = new Date(at(3)).getTime();
    expect(pitchVotingHasClosed(event, projectTime)).toBe(true);
    expect(innolabProjectFormationIsOpen(event, projectTime)).toBe(true);
  });

  test("registration spans idea collection through the project deadline", () => {
    expect(eventRegistrationIsOpen(event, new Date(at(-49)).getTime())).toBe(false);
    expect(eventRegistrationIsOpen(event, NOW)).toBe(true);
    expect(eventRegistrationIsOpen(event, new Date(at(73)).getTime())).toBe(false);
  });

  test("standard events retain the original project submission window", () => {
    expect(
      eventRegistrationIsOpen(
        {
          ...event,
          workflow: "standard",
          submissionsOpen: at(-1),
          submissionsClose: at(1),
        },
        NOW
      )
    ).toBe(true);
  });
});
