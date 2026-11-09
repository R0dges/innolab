import { describe, expect, test } from "bun:test";

import {
  type EventDates,
  hasVoting,
  judgingIsOpen,
  milestones,
  phaseOf,
  submissionsAreOpen,
  votingIsOpen,
} from "@/lib/phase";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-10-01T00:00:00Z");
const at = (h: number) => new Date(T0 + h * HOUR);

const event: EventDates = {
  submissionsOpen: at(0),
  submissionsClose: at(48),
  judgingClose: at(96),
  votingOpen: at(50),
  votingClose: at(72),
  resultsPublished: false,
};

describe("judgingIsOpen", () => {
  test("opens at judgingOpen and closes at judgingClose", () => {
    const e = { ...event, judgingOpen: at(60) };
    expect(judgingIsOpen(e, T0 + 60 * HOUR - 1)).toBe(false);
    expect(judgingIsOpen(e, T0 + 60 * HOUR)).toBe(true);
    expect(judgingIsOpen(e, T0 + 96 * HOUR - 1)).toBe(true);
    expect(judgingIsOpen(e, T0 + 96 * HOUR)).toBe(false);
  });

  test("falls back to the submission deadline for legacy events", () => {
    expect(judgingIsOpen(event, T0 + 48 * HOUR - 1)).toBe(false);
    expect(judgingIsOpen(event, T0 + 48 * HOUR)).toBe(true);
  });

  test("stays closed once results are published", () => {
    expect(judgingIsOpen({ ...event, resultsPublished: true }, T0 + 60 * HOUR)).toBe(false);
  });
});

describe("submissionsAreOpen", () => {
  test("opens at submissionsOpen (inclusive) and closes at the deadline (exclusive)", () => {
    expect(submissionsAreOpen(event, T0 - 1)).toBe(false);
    expect(submissionsAreOpen(event, T0)).toBe(true);
    expect(submissionsAreOpen(event, T0 + 48 * HOUR - 1)).toBe(true);
    expect(submissionsAreOpen(event, T0 + 48 * HOUR)).toBe(false);
  });

  test("with no opening date, is open until the deadline", () => {
    const e = { ...event, submissionsOpen: null };
    expect(submissionsAreOpen(e, T0 - 1000 * HOUR)).toBe(true);
    expect(submissionsAreOpen(e, T0 + 48 * HOUR)).toBe(false);
  });

  test("accepts ISO strings", () => {
    const e = {
      ...event,
      submissionsOpen: at(0).toISOString(),
      submissionsClose: at(48).toISOString(),
    };
    expect(submissionsAreOpen(e, T0 + HOUR)).toBe(true);
  });
});

describe("votingIsOpen", () => {
  test("requires a window", () => {
    const none = { ...event, votingOpen: null, votingClose: null };
    expect(votingIsOpen(none, T0 + 60 * HOUR)).toBe(false);
    expect(hasVoting(none)).toBe(false);
    expect(hasVoting(event)).toBe(true);
  });

  test("is open inside the window only", () => {
    expect(votingIsOpen(event, T0 + 49 * HOUR)).toBe(false);
    expect(votingIsOpen(event, T0 + 50 * HOUR)).toBe(true);
    expect(votingIsOpen(event, T0 + 72 * HOUR - 1)).toBe(true);
    expect(votingIsOpen(event, T0 + 72 * HOUR)).toBe(false);
  });

  test("a half-open window is open on its open side", () => {
    expect(votingIsOpen({ ...event, votingOpen: null }, T0)).toBe(true);
    expect(votingIsOpen({ ...event, votingClose: null }, T0 + 1000 * HOUR)).toBe(true);
    expect(hasVoting({ ...event, votingOpen: null })).toBe(true);
  });

  test("disables community project voting for the Innolab journey", () => {
    const innolab = { ...event, workflow: "innolab" };
    expect(hasVoting(innolab)).toBe(false);
    expect(votingIsOpen(innolab, T0 + 60 * HOUR)).toBe(false);
  });
});

describe("phaseOf", () => {
  test("moves through the lifecycle over time", () => {
    expect(phaseOf(event, T0 - HOUR)).toBe("upcoming");
    expect(phaseOf(event, T0 + HOUR)).toBe("submissions");
    expect(phaseOf(event, T0 + 49 * HOUR)).toBe("judging");
    expect(phaseOf(event, T0 + 60 * HOUR)).toBe("voting");
    expect(phaseOf(event, T0 + 80 * HOUR)).toBe("judging");
  });

  test("published results win over every date", () => {
    const e = { ...event, resultsPublished: true };
    expect(phaseOf(e, T0 - HOUR)).toBe("results");
    expect(phaseOf(e, T0 + 60 * HOUR)).toBe("results");
  });
});

describe("milestones", () => {
  test("lists only set dates, in time order", () => {
    const shuffled = { ...event, votingOpen: at(10), judgingOpen: null, judgingClose: null };
    expect(milestones(shuffled).map((m) => m.key)).toEqual([
      "open",
      "voteOpen",
      "close",
      "voteClose",
    ]);
  });

  test("omits community voting milestones for Innolab", () => {
    const keys = milestones({
      ...event,
      workflow: "innolab",
      pitchVotingOpen: at(10),
      pitchVotingClose: at(11),
    }).map((milestone) => milestone.key);
    expect(keys).toContain("pitchVoteOpen");
    expect(keys).not.toContain("voteOpen");
    expect(keys).not.toContain("voteClose");
  });
});
