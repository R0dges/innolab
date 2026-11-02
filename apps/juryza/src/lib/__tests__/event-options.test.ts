import { describe, expect, test } from "bun:test";

import {
  DEFAULT_EVENT_LOCATION,
  DEFAULT_EVENT_MODE,
  DEFAULT_EVENT_WORKFLOW,
  EVENT_LOCATIONS,
} from "@/lib/event-options";
import { eventInput } from "@/lib/server/schemas";

const required = {
  name: "Innolab Neuchâtel",
  slug: "innolab-neuchatel",
  submissionsClose: "2027-04-18T18:00:00.000Z",
};

describe("event defaults", () => {
  test("uses the Innolab in-person Geneva configuration", () => {
    const parsed = eventInput.parse(required);

    expect(parsed.mode).toBe(DEFAULT_EVENT_MODE);
    expect(parsed.location).toBe(DEFAULT_EVENT_LOCATION);
    expect(parsed.workflow).toBe(DEFAULT_EVENT_WORKFLOW);
  });

  test("keeps the selectable locations in the requested order", () => {
    expect(EVENT_LOCATIONS).toEqual(["Neuchâtel", "Genève", "Lausanne"]);
  });

  test("preserves an explicit online event without a location", () => {
    const parsed = eventInput.parse({ ...required, mode: "online", location: null });

    expect(parsed.mode).toBe("online");
    expect(parsed.location).toBeNull();
  });
});
