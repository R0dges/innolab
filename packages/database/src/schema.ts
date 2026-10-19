/**
 * Drizzle schema for Juryza — the whole persistence model in one file.
 *
 * Two families of tables live here:
 *
 * 1. **Better Auth tables** (`user`, `session`, `account`, `verification`) —
 *    owned by Better Auth's Drizzle adapter. `user` carries the platform role
 *    (admin plugin) plus the public profile fields.
 * 2. **Domain tables** — events and everything scoped to one: tracks, prizes,
 *    rubric, registrations, teams, projects, judges, assignments, scores,
 *    pairwise comparisons, community votes, comments, announcements, audit.
 *
 * Every id is a prefixed text id (`evt_…`, `prj_…`) so fixture rows keep their
 * original identifiers and a value read from a log or CSV says what it is.
 * Rich text (event overview, rules, project write-ups) is stored as the
 * editor's ProseMirror JSON and rendered through a fixed node schema, so user
 * content never reaches the page as raw HTML.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/** A ProseMirror/Tiptap document. Opaque to the database. */
export type RichDoc = { type: "doc"; content?: unknown[] };

const createdAt = () =>
  timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull();

/* ------------------------------------------------------------------ */
/* Better Auth core tables                                            */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  // Platform role: participant | judge | organizer | admin. A visitor is an
  // unauthenticated request. Enforced in the backend on every route.
  role: text("role").default("participant").notNull(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // Public profile. `username` is the stable handle used in profile URLs and
  // in API selectors such as `/api/judge/scores?judge=<username>`.
  username: text("username").unique(),
  headline: text("headline"),
  bio: text("bio"),
  location: text("location"),
  websiteUrl: text("website_url"),
  githubUrl: text("github_url"),
  skills: jsonb("skills").$type<string[]>().default([]).notNull(),
  lookingForTeam: boolean("looking_for_team").default(false).notNull(),
  points: integer("points").default(0).notNull(),
  prizeUsd: integer("prize_usd").default(0).notNull(),
  awardsCount: integer("awards_count").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

/**
 * Personal API tokens. `Authorization: Bearer <token>` resolves to the owning
 * user and their role. The acceptance checker uses seeded tokens; any user can
 * mint their own from Settings → API tokens. Only a SHA-256 hash is stored.
 */
export const apiToken = pgTable("api_token", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  // First characters of the token, shown in the UI so a user can tell tokens apart.
  prefix: text("prefix").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  label: text("label"),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at"),
});

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

export const event = pgTable("event", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  // Plain-text summary (search, cards, embeds) and the rich overview/rules.
  description: text("description"),
  content: jsonb("content").$type<RichDoc>(),
  rules: jsonb("rules").$type<RichDoc>(),
  mode: text("mode").default("online").notNull(), // online | in-person | hybrid
  location: text("location"),
  // Accent hue (0–360) for the event's cover gradient.
  hue: integer("hue").default(250).notNull(),
  // draft events are visible to organizers only; published are public.
  visibility: text("visibility").default("published").notNull(), // draft | published
  // Standard events keep Juryza's project-first flow. Innolab adds an idea
  // preselection before teams and projects are formed.
  workflow: text("workflow").default("standard").notNull(), // standard | innolab
  pitchSubmissionsOpen: timestamp("pitch_submissions_open"),
  pitchSubmissionsClose: timestamp("pitch_submissions_close"),
  pitchVotingOpen: timestamp("pitch_voting_open"),
  pitchVotingClose: timestamp("pitch_voting_close"),
  // Lifecycle: submissions → judging → community voting → results.
  submissionsOpen: timestamp("submissions_open"),
  submissionsClose: timestamp("submissions_close").notNull(),
  judgingClose: timestamp("judging_close"),
  votingOpen: timestamp("voting_open"),
  votingClose: timestamp("voting_close"),
  resultsPublished: boolean("results_published").default(false).notNull(),
  isFixture: boolean("is_fixture").default(false).notNull(),
  // Team + judging configuration.
  maxTeamSize: integer("max_team_size").default(4).notNull(),
  reviewsPerProject: integer("reviews_per_project").default(3).notNull(),
  // Community voting configuration (T3).
  votingAccess: text("voting_access").default("authenticated").notNull(), // open | email | authenticated
  votingEmailDomains: jsonb("voting_email_domains").$type<string[]>().default([]).notNull(),
  voteBudget: integer("vote_budget").default(16).notNull(),
  // Anti-abuse levers (all default to the pre-existing behaviour):
  //  - votingMode `quadratic` (a counted public vote) or `writeup` (public
  //    input with no live tally; the judging panel decides).
  //  - votingShortlistSize `0` = every submitted project is votable; `N` = only
  //    the top N by judged rank, so a poll runs on finalists alone.
  //  - votingElectorateLockAt: only accounts created on or before this instant
  //    may vote — automates the "member before kickoff" rule.
  votingMode: text("voting_mode").default("quadratic").notNull(), // quadratic | writeup
  votingShortlistSize: integer("voting_shortlist_size").default(0).notNull(),
  votingElectorateLockAt: timestamp("voting_electorate_lock_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const track = pgTable("track", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  position: integer("position").default(0).notNull(),
});

export const prize = pgTable("prize", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  // Awarded by overall judged rank, within one track, or by community vote.
  kind: text("kind").default("overall").notNull(), // overall | track | community
  trackId: text("track_id").references(() => track.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  amount: text("amount"),
  rank: integer("rank").default(1).notNull(),
});

/**
 * Organizer-configurable, weighted scoring criteria (T2). Weights are relative;
 * they are normalized to sum to 1 at compute time (see lib/scoring.ts).
 */
export const rubricCriterion = pgTable("rubric_criterion", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  weight: real("weight").default(1).notNull(),
  position: integer("position").default(0).notNull(),
});

/** A participant's registration for an event. Creating or joining a team registers you. */
export const registration = pgTable(
  "registration",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })]
);

export const announcement = pgTable("announcement", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Innolab idea preselection                                          */
/* ------------------------------------------------------------------ */

export const pitch = pgTable(
  "pitch",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").default("draft").notNull(), // draft | submitted | selected | rejected
    submittedAt: timestamp("submitted_at"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("pitch_event_status_idx").on(t.eventId, t.status)]
);

export const pitchVote = pgTable(
  "pitch_vote",
  {
    id: text("id").primaryKey(),
    pitchId: text("pitch_id")
      .notNull()
      .references(() => pitch.id, { onDelete: "cascade" }),
    voterId: text("voter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.pitchId, t.voterId)]
);

/* ------------------------------------------------------------------ */
/* Teams and projects                                                 */
/* ------------------------------------------------------------------ */

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  lookingForMembers: boolean("looking_for_members").default(false).notNull(),
  // Whoever holds the invite link can join (up to the event's max team size).
  inviteToken: text("invite_token").notNull().unique(),
  createdAt: createdAt(),
});

export const teamMember = pgTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(), // owner | member
    joinedAt: timestamp("joined_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })]
);

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
    pitchId: text("pitch_id")
      .unique()
      .references(() => pitch.id, { onDelete: "set null" }),
    trackId: text("track_id").references(() => track.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    tagline: text("tagline"),
    // Plain-text rendering of `content`, kept for search, cards and similarity.
    description: text("description"),
    content: jsonb("content").$type<RichDoc>(),
    thumbnailUrl: text("thumbnail_url"),
    videoUrl: text("video_url"),
    repoUrl: text("repo_url"),
    liveUrl: text("live_url"),
    techTags: jsonb("tech_tags").$type<string[]>().default([]).notNull(),
    // draft until submitted; editable until the deadline.
    status: text("status").default("draft").notNull(), // draft | submitted
    submittedAt: timestamp("submitted_at"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("project_event_status_idx").on(t.eventId, t.status)]
);

/* ------------------------------------------------------------------ */
/* Judging                                                            */
/* ------------------------------------------------------------------ */

/** The judging panel of an event. Only panel members can be assigned projects. */
export const eventJudge = pgTable(
  "event_judge",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Tracks this judge may review; empty = every track.
    trackIds: jsonb("track_ids").$type<string[]>().default([]).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })]
);

/** An emailed (here: copy-a-link) invitation to join an event's judging panel. */
export const judgeInvite = pgTable("judge_invite", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  trackIds: jsonb("track_ids").$type<string[]>().default([]).notNull(),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at"),
  createdAt: createdAt(),
});

/** Judge ↔ project assignment. A judge only ever sees projects assigned to them. */
export const assignment = pgTable(
  "assignment",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    judgeId: text("judge_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    batch: integer("batch").default(1).notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.judgeId, t.projectId), index("assignment_event_idx").on(t.eventId)]
);

/**
 * A judge's score for one project: per-criterion 1–5 marks keyed by criterion
 * key. The weighted aggregate and normalized value are computed on read so
 * re-weighting the rubric never leaves stale numbers behind.
 */
export const score = pgTable(
  "score",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    judgeId: text("judge_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    criteria: jsonb("criteria").$type<Record<string, number>>().notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique().on(t.judgeId, t.projectId), index("score_event_idx").on(t.eventId)]
);

/** Pairwise comparison: a judge picked `winnerId` over `loserId` (Bradley–Terry). */
export const pairwiseVote = pgTable("pairwise_vote", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  judgeId: text("judge_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  winnerId: text("winner_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  loserId: text("loser_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Community                                                          */
/* ------------------------------------------------------------------ */

/**
 * A voter's quadratic allocation to one project (T3). `votes` is the number of
 * votes; its cost is votes², and the sum of costs per voter is capped by the
 * event's `voteBudget`. `voterKey` is `user:<id>`, `email:<address>` or
 * `anon:<cookie>` depending on the event's access mode.
 */
export const vote = pgTable(
  "vote",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    voterKey: text("voter_key").notNull(),
    votes: integer("votes").default(1).notNull(),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [unique().on(t.projectId, t.voterKey), index("vote_event_idx").on(t.eventId)]
);

/** Email-gated voting: a one-time code proves control of an address. */
export const voter = pgTable(
  "voter",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    // Session secret handed back after verification, stored hashed.
    sessionHash: text("session_hash"),
    attempts: integer("attempts").default(0).notNull(),
    verifiedAt: timestamp("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.eventId, t.email)]
);

export const comment = pgTable("comment", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Operations                                                         */
/* ------------------------------------------------------------------ */

/**
 * Append-only audit trail. Every consequential action writes one row with a
 * human-readable action name; organizers read it in the dashboard.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id"),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_event_idx").on(t.eventId, t.createdAt)]
);

/** Webhook subscriptions. Deliveries are HMAC-signed with the subscription's secret. */
export const webhook = pgTable("webhook", {
  id: text("id").primaryKey(),
  eventId: text("event_id").references(() => event.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  // Which event types to deliver; empty = all.
  events: jsonb("events").$type<string[]>().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const webhookDelivery = pgTable("webhook_delivery", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id")
    .notNull()
    .references(() => webhook.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  status: integer("status"),
  ok: boolean("ok").default(false).notNull(),
  error: text("error"),
  createdAt: createdAt(),
});

/**
 * Signed, publicly verifiable certificates (T4): judge participation and prize
 * winners. `signature` is an HMAC over the canonical fields; anyone can
 * re-verify at /certificates/<serial>.
 */
export const certificate = pgTable("certificate", {
  id: text("id").primaryKey(),
  serial: text("serial").notNull().unique(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  subjectId: text("subject_id").references(() => user.id, { onDelete: "set null" }),
  subjectName: text("subject_name").notNull(),
  kind: text("kind").notNull(), // judge | winner | participant
  statement: text("statement").notNull(),
  reviewsCompleted: integer("reviews_completed").default(0).notNull(),
  signature: text("signature").notNull(),
  issuedAt: timestamp("issued_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

/* ------------------------------------------------------------------ */
/* Relations                                                          */
/* ------------------------------------------------------------------ */

export const eventRelations = relations(event, ({ many }) => ({
  tracks: many(track),
  prizes: many(prize),
  criteria: many(rubricCriterion),
  teams: many(team),
  projects: many(project),
  pitches: many(pitch),
}));

export const pitchRelations = relations(pitch, ({ one, many }) => ({
  event: one(event, { fields: [pitch.eventId], references: [event.id] }),
  author: one(user, { fields: [pitch.authorId], references: [user.id] }),
  votes: many(pitchVote),
  project: one(project),
}));

export const pitchVoteRelations = relations(pitchVote, ({ one }) => ({
  pitch: one(pitch, { fields: [pitchVote.pitchId], references: [pitch.id] }),
  voter: one(user, { fields: [pitchVote.voterId], references: [user.id] }),
}));

export const trackRelations = relations(track, ({ one, many }) => ({
  event: one(event, { fields: [track.eventId], references: [event.id] }),
  projects: many(project),
}));

export const prizeRelations = relations(prize, ({ one }) => ({
  event: one(event, { fields: [prize.eventId], references: [event.id] }),
}));

export const rubricRelations = relations(rubricCriterion, ({ one }) => ({
  event: one(event, { fields: [rubricCriterion.eventId], references: [event.id] }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  event: one(event, { fields: [team.eventId], references: [event.id] }),
  members: many(teamMember),
  projects: many(project),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
  user: one(user, { fields: [teamMember.userId], references: [user.id] }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  event: one(event, { fields: [project.eventId], references: [event.id] }),
  team: one(team, { fields: [project.teamId], references: [team.id] }),
  track: one(track, { fields: [project.trackId], references: [track.id] }),
  pitch: one(pitch, { fields: [project.pitchId], references: [pitch.id] }),
  assignments: many(assignment),
  scores: many(score),
  votes: many(vote),
  comments: many(comment),
}));

export const assignmentRelations = relations(assignment, ({ one }) => ({
  event: one(event, { fields: [assignment.eventId], references: [event.id] }),
  judge: one(user, { fields: [assignment.judgeId], references: [user.id] }),
  project: one(project, { fields: [assignment.projectId], references: [project.id] }),
}));

export const scoreRelations = relations(score, ({ one }) => ({
  event: one(event, { fields: [score.eventId], references: [event.id] }),
  judge: one(user, { fields: [score.judgeId], references: [user.id] }),
  project: one(project, { fields: [score.projectId], references: [project.id] }),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  project: one(project, { fields: [comment.projectId], references: [project.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));

export type User = typeof user.$inferSelect;
export type Event = typeof event.$inferSelect;
export type Track = typeof track.$inferSelect;
export type Prize = typeof prize.$inferSelect;
export type RubricCriterion = typeof rubricCriterion.$inferSelect;
export type Team = typeof team.$inferSelect;
export type TeamMember = typeof teamMember.$inferSelect;
export type Project = typeof project.$inferSelect;
export type Pitch = typeof pitch.$inferSelect;
export type PitchVote = typeof pitchVote.$inferSelect;
export type Assignment = typeof assignment.$inferSelect;
export type Score = typeof score.$inferSelect;
export type Vote = typeof vote.$inferSelect;
export type Comment = typeof comment.$inferSelect;
export type Announcement = typeof announcement.$inferSelect;
export type ApiToken = typeof apiToken.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type Webhook = typeof webhook.$inferSelect;
export type WebhookDelivery = typeof webhookDelivery.$inferSelect;
export type Certificate = typeof certificate.$inferSelect;
export type PairwiseVote = typeof pairwiseVote.$inferSelect;
export type EventJudge = typeof eventJudge.$inferSelect;
export type JudgeInvite = typeof judgeInvite.$inferSelect;
