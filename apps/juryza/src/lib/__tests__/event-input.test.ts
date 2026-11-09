import { describe, expect, test } from "bun:test";

import { eventAssistantInput } from "@/lib/server/event-workspace";
import { eventInput } from "@/lib/server/schemas";

const base = {
  name: "Innovation Lab mobilité",
  slug: "innovation-lab-mobilite",
  submissionsClose: "2026-12-04T16:00:00.000Z",
};

describe("event creation audit resources", () => {
  test("accepts one reference audit and organized document links", () => {
    const parsed = eventInput.parse({
      ...base,
      auditDocument: {
        title: "Audit initial",
        url: "https://example.com/audit",
      },
      resources: [
        {
          kind: "accessible",
          name: "Base documentaire",
          category: "Documentation",
          url: "https://example.com/documents",
        },
      ],
    });

    expect(parsed.auditDocument?.findings).toEqual([]);
    expect(parsed.resources[0]).toMatchObject({
      accessLevel: "event",
      availability: "available",
      position: 0,
    });
  });

  test("rejects links containing embedded credentials", () => {
    const parsed = eventInput.safeParse({
      ...base,
      resources: [
        {
          kind: "accessible",
          name: "Lien privé",
          category: "Documentation",
          url: "https://user:secret@example.com/documents",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("event assistant link", () => {
  test("accepts one HTTP(S) assistant URL or its removal", () => {
    expect(
      eventAssistantInput.parse({ url: "https://copilot.microsoft.com/example" })
    ).toEqual({ url: "https://copilot.microsoft.com/example" });
    expect(eventAssistantInput.parse({ url: null })).toEqual({ url: null });
  });

  test("rejects non-HTTP links and embedded credentials", () => {
    expect(eventAssistantInput.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
    expect(
      eventAssistantInput.safeParse({ url: "https://user:secret@example.com/assistant" }).success
    ).toBe(false);
  });
});
