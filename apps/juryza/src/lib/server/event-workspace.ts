import { z } from "zod";

import type { EventViewer } from "@/lib/server/events";

const httpUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.username === "" &&
      parsed.password === ""
    );
  }, "Use an HTTP(S) URL without embedded credentials");

const optionalText = (max: number) => z.string().trim().max(max).nullish();
const notes = z.array(z.string().trim().min(1).max(500)).max(20);

export const documentInput = z.object({
  title: z.string().trim().min(2).max(120),
  url: httpUrl,
  summary: optionalText(3000),
  findings: notes.default([]),
  problems: notes.default([]),
});

export const resourceInput = z.object({
  kind: z.enum(["scope", "accessible", "tool"]),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: optionalText(2000),
  url: httpUrl.nullish(),
  accessLevel: z.enum(["public", "event", "restricted"]).default("event"),
  availability: z.enum(["available", "limited", "unavailable"]).default("available"),
  ownerName: optionalText(120),
  position: z.number().int().min(0).max(10_000).default(0),
});

export const resourcePatch = resourceInput
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const eventAssistantInput = z.object({
  url: httpUrl.nullable(),
});

export function canAccessEventWorkspace(viewer: EventViewer): boolean {
  return Boolean(viewer?.registered || viewer?.isJudge || viewer?.canManage);
}
