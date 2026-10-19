import { z } from "zod";

/** Shared request-body building blocks. */

export const optionalUrl = z
  .union([z.url({ protocol: /^https?$/, message: "Must be an http(s) URL" }), z.literal("")])
  .nullish()
  .transform((v) => v || null);

export const isoDate = z.iso.datetime({ offset: true, message: "Must be an ISO 8601 date" });
export const optionalDate = isoDate.nullish();

/** A ProseMirror document from the editor. Structure is enforced at render time. */
export const richDoc = z
  .object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() })
  .nullish();

const RESERVED_SLUGS = new Set(["import", "new", "api", "admin", "settings"]);

export const slug = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only")
  .refine((s) => !RESERVED_SLUGS.has(s), "That URL is reserved");

export const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

type InnolabSchedule = {
  workflow?: string;
  pitchSubmissionsOpen?: Date | string | null;
  pitchSubmissionsClose?: Date | string | null;
  pitchVotingOpen?: Date | string | null;
  pitchVotingClose?: Date | string | null;
  submissionsOpen?: Date | string | null;
};

/** Returns a user-facing issue when an Innolab preselection timeline is inconsistent. */
export function innolabScheduleIssue(value: InnolabSchedule): string | null {
  if (value.workflow !== "innolab") return null;
  const time = (date: Date | string | null | undefined) => (date ? new Date(date).getTime() : null);
  const pitchOpen = time(value.pitchSubmissionsOpen);
  const pitchClose = time(value.pitchSubmissionsClose);
  const voteOpen = time(value.pitchVotingOpen);
  const voteClose = time(value.pitchVotingClose);
  const projectsOpen = time(value.submissionsOpen);
  if (pitchClose === null || voteOpen === null || voteClose === null) {
    return "Innolab requires an idea submission deadline and a complete idea voting window";
  }
  if (pitchOpen !== null && pitchOpen >= pitchClose) {
    return "Idea submissions must open before they close";
  }
  if (voteOpen < pitchClose) return "Idea voting must open after idea submissions close";
  if (voteClose <= voteOpen) return "Idea voting must close after it opens";
  if (projectsOpen !== null && projectsOpen < voteClose) {
    return "Project submissions must open after idea voting closes";
  }
  return null;
}
