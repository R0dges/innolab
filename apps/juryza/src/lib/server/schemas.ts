import { z } from "zod";

import { isoDate, optionalDate, optionalUrl, richDoc, slug } from "@/lib/server/validation";

/**
 * Request schemas shared by more than one route (and by the OpenAPI document,
 * which renders them with `z.toJSONSchema`).
 */

// Event fields without defaults, so a PATCH only touches what it sends.
const eventFields = {
  name: z.string().trim().min(3).max(80),
  slug,
  tagline: z.string().trim().max(140).nullish(),
  content: richDoc,
  rules: richDoc,
  mode: z.enum(["online", "in-person", "hybrid"]),
  location: z.string().trim().max(120).nullish(),
  hue: z.number().int().min(0).max(360),
  visibility: z.enum(["draft", "published"]),
  workflow: z.enum(["standard", "innolab"]),
  pitchSubmissionsOpen: optionalDate,
  pitchSubmissionsClose: optionalDate,
  pitchVotingOpen: optionalDate,
  pitchVotingClose: optionalDate,
  submissionsOpen: optionalDate,
  submissionsClose: isoDate,
  judgingClose: optionalDate,
  votingOpen: optionalDate,
  votingClose: optionalDate,
  maxTeamSize: z.number().int().min(1).max(20),
  reviewsPerProject: z.number().int().min(1).max(10),
  votingAccess: z.enum(["open", "email", "authenticated"]),
  votingEmailDomains: z.array(z.string().trim().toLowerCase().min(3)).max(20),
  voteBudget: z.number().int().min(1).max(400),
  // Anti-abuse levers (see /docs/voting). All optional; defaults preserve the
  // original counted-quadratic behaviour.
  votingMode: z.enum(["quadratic", "writeup"]),
  votingShortlistSize: z.number().int().min(0).max(100),
  votingElectorateLockAt: optionalDate,
};

export const eventInput = z.object({
  ...eventFields,
  mode: eventFields.mode.default("online"),
  hue: eventFields.hue.default(250),
  visibility: eventFields.visibility.default("draft"),
  workflow: eventFields.workflow.default("standard"),
  maxTeamSize: eventFields.maxTeamSize.default(4),
  reviewsPerProject: eventFields.reviewsPerProject.default(3),
  votingAccess: eventFields.votingAccess.default("authenticated"),
  votingEmailDomains: eventFields.votingEmailDomains.default([]),
  voteBudget: eventFields.voteBudget.default(16),
  votingMode: eventFields.votingMode.default("quadratic"),
  votingShortlistSize: eventFields.votingShortlistSize.default(0),
  votingElectorateLockAt: eventFields.votingElectorateLockAt,
  tracks: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

export const eventPatch = z.object(eventFields).partial();

export const projectInput = z.object({
  title: z.string().trim().min(1, "Give your project a title").max(100),
  tagline: z.string().trim().max(160).nullish(),
  trackId: z.string().nullish(),
  content: richDoc,
  thumbnailUrl: optionalUrl,
  videoUrl: optionalUrl,
  repoUrl: optionalUrl,
  liveUrl: optionalUrl,
  techTags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  // true = submit now (draft → submitted). Submitted projects stay editable until the deadline.
  submit: z.boolean().optional(),
});
