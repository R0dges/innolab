import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Event } from "@/lib/db";
import {
  assignment,
  db,
  event,
  eventJudge,
  pairwiseVote,
  prize,
  project,
  registration,
  rubricCriterion,
  score,
  team,
  teamMember,
  track,
  user as userTable,
} from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { docToText, textToDoc } from "@/lib/rich-text";
import { auth } from "@/lib/server/auth";

/**
 * The migration path in and out.
 *
 * A **bundle** is a superset of the DOGFOOD `fixtures.json` shape: the same
 * `event / tracks / judges / teams / projects / scores` records, keyed the same
 * way (people by email, projects by id), plus optional `rubric`, `prizes`,
 * `pairwise` and rich project content. So:
 *
 *  - `exportBundle(event)` produces a file any Juryza instance can import,
 *  - the fixtures file itself is a valid bundle (the seed imports it this way),
 *  - a CSV-to-bundle script from another platform only has to fill six arrays.
 *
 * Import creates a NEW event. Ids are kept when they are free and remapped when
 * they collide, so importing twice never clobbers anything. People are matched
 * by email; unknown emails get a fresh account (password set via reset).
 */

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export const bundleSchema = z.object({
  format: z.string().optional(),
  event: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    slug: z.string().optional(),
    tagline: z.string().nullish(),
    description: z.string().nullish(),
    submissions_open: iso.nullish(),
    submissions_close: iso,
    judging_close: iso.nullish(),
    voting_open: iso.nullish(),
    voting_close: iso.nullish(),
    max_team_size: z.number().int().optional(),
    reviews_per_project: z.number().int().optional(),
    voting_access: z.enum(["open", "email", "authenticated"]).optional(),
    vote_budget: z.number().int().optional(),
    hue: z.number().int().optional(),
    is_fixture: z.boolean().optional(),
  }),
  tracks: z
    .array(z.object({ id: z.string(), name: z.string(), description: z.string().nullish() }))
    .default([]),
  rubric: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        weight: z.number().positive(),
        description: z.string().nullish(),
      })
    )
    .optional(),
  prizes: z
    .array(
      z.object({
        name: z.string(),
        kind: z.enum(["overall", "track", "community"]).default("overall"),
        track: z.string().nullish(),
        amount: z.string().nullish(),
        rank: z.number().int().default(1),
        description: z.string().nullish(),
      })
    )
    .default([]),
  judges: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        tracks: z.array(z.string()).default([]),
      })
    )
    .default([]),
  teams: z
    .array(z.object({ id: z.string(), name: z.string(), members: z.array(z.string()).default([]) }))
    .default([]),
  projects: z
    .array(
      z.object({
        id: z.string(),
        team: z.string().nullish(),
        track: z.string().nullish(),
        title: z.string(),
        tagline: z.string().nullish(),
        summary: z.string().nullish(),
        content: z
          .object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() })
          .nullish(),
        repo_url: z.string().nullish(),
        live_url: z.string().nullish(),
        video_url: z.string().nullish(),
        thumbnail_url: z.string().nullish(),
        tech_tags: z.array(z.string()).default([]),
        status: z.enum(["draft", "submitted"]).default("submitted"),
        submitted_at: iso.nullish(),
      })
    )
    .default([]),
  scores: z
    .array(
      z.object({
        judge: z.string(),
        project: z.string(),
        criteria: z.record(z.string(), z.number()),
        favorite: z.boolean().default(false),
        comment: z.string().nullish(),
      })
    )
    .default([]),
  pairwise: z
    .array(z.object({ judge: z.string(), winner: z.string(), loser: z.string() }))
    .default([]),
});
export type Bundle = z.infer<typeof bundleSchema>;

export interface ImportOptions {
  createdBy: string | null;
  /** Password for newly created accounts; random (reset required) when omitted. */
  passwordFor?: (email: string) => string;
  visibility?: "draft" | "published";
  isFixture?: boolean;
}

export interface ImportReport {
  eventId: string;
  slug: string;
  created: Record<string, number>;
  skipped: string[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "event";

/** Ensure a user exists for `email`; returns its id. */
async function ensureUser(
  email: string,
  name: string,
  password: string
): Promise<{ id: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const [found] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalized))
    .limit(1);
  if (found) return { id: found.id, created: false };
  const res = await auth.api.signUpEmail({ body: { email: normalized, name, password } });
  return { id: res.user.id, created: true };
}

export async function importBundle(input: Bundle, opts: ImportOptions): Promise<ImportReport> {
  const b = bundleSchema.parse(input);
  const skipped: string[] = [];
  const created: Record<string, number> = {
    users: 0,
    tracks: 0,
    teams: 0,
    projects: 0,
    judges: 0,
    scores: 0,
    comparisons: 0,
  };
  const password = opts.passwordFor ?? (() => secretToken(24));

  // Keep an id if it is free in `table`, otherwise mint a fresh one.
  const freeIds = async (
    table: typeof event | typeof track | typeof team | typeof project,
    ids: string[],
    mint: () => string
  ) => {
    const taken = ids.length
      ? new Set(
          (await db.select({ id: table.id }).from(table).where(inArray(table.id, ids))).map(
            (r) => r.id
          )
        )
      : new Set<string>();
    return new Map(ids.map((x) => [x, taken.has(x) ? mint() : x]));
  };

  const [eventIdMap, trackIds, teamIds, projectIds] = await Promise.all([
    freeIds(event, b.event.id ? [b.event.id] : [], id.event),
    freeIds(
      track,
      b.tracks.map((t) => t.id),
      id.track
    ),
    freeIds(
      team,
      b.teams.map((t) => t.id),
      id.team
    ),
    freeIds(
      project,
      b.projects.map((p) => p.id),
      id.project
    ),
  ]);
  const eventId = (b.event.id && eventIdMap.get(b.event.id)) || id.event();

  let slug = b.event.slug ? slugify(b.event.slug) : slugify(b.event.name);
  const [slugTaken] = await db
    .select({ id: event.id })
    .from(event)
    .where(eq(event.slug, slug))
    .limit(1);
  if (slugTaken)
    slug = `${slug}-${secretToken(4)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "x")}`;

  const d = (s: string | null | undefined) => (s ? new Date(s) : null);
  await db.insert(event).values({
    id: eventId,
    slug,
    name: b.event.name,
    tagline: b.event.tagline ?? null,
    description: b.event.description ?? null,
    content: b.event.description ? textToDoc(b.event.description) : null,
    visibility: opts.visibility ?? "draft",
    workflow: "standard",
    submissionsOpen: d(b.event.submissions_open),
    submissionsClose: new Date(b.event.submissions_close),
    judgingClose: d(b.event.judging_close),
    votingOpen: d(b.event.voting_open),
    votingClose: d(b.event.voting_close),
    maxTeamSize: b.event.max_team_size ?? 6,
    reviewsPerProject: b.event.reviews_per_project ?? 3,
    votingAccess: b.event.voting_access ?? "authenticated",
    voteBudget: b.event.vote_budget ?? 16,
    hue: b.event.hue ?? 250,
    isFixture: opts.isFixture ?? b.event.is_fixture ?? false,
    createdBy: opts.createdBy,
  });

  if (b.tracks.length) {
    await db.insert(track).values(
      b.tracks.map((t, position) => ({
        id: trackIds.get(t.id) as string,
        eventId,
        name: t.name,
        description: t.description ?? null,
        position,
      }))
    );
    created.tracks = b.tracks.length;
  }
  const trackOf = (x: string | null | undefined) => (x ? (trackIds.get(x) ?? null) : null);

  // Rubric: explicit, or inferred from the criteria keys used in scores.
  const rubric =
    b.rubric ??
    [...new Set(b.scores.flatMap((s) => Object.keys(s.criteria)))].map((key) => ({
      key,
      label: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      weight: 1,
      description: null,
    }));
  if (rubric.length) {
    await db.insert(rubricCriterion).values(
      rubric.map((c, position) => ({
        id: id.criterion(),
        eventId,
        key: c.key,
        label: c.label,
        weight: c.weight,
        description: c.description ?? null,
        position,
      }))
    );
  }
  if (b.prizes.length) {
    await db.insert(prize).values(
      b.prizes.map((p) => ({
        id: id.prize(),
        eventId,
        kind: p.kind,
        trackId: trackOf(p.track),
        name: p.name,
        amount: p.amount ?? null,
        rank: p.rank,
        description: p.description ?? null,
      }))
    );
  }

  // Judges: bundle judge id → user id.
  const judgeUser = new Map<string, string>();
  for (const j of b.judges) {
    const u = await ensureUser(j.email, j.name, password(j.email));
    if (u.created) created.users = (created.users ?? 0) + 1;
    judgeUser.set(j.id, u.id);
    await db
      .insert(eventJudge)
      .values({
        eventId,
        userId: u.id,
        trackIds: j.tracks.map((t) => trackOf(t)).filter((t): t is string => Boolean(t)),
      })
      .onConflictDoNothing();
    await db.update(userTable).set({ role: "judge" }).where(eq(userTable.id, u.id));
  }
  created.judges = judgeUser.size;

  // Teams and members.
  for (const t of b.teams) {
    const teamId = teamIds.get(t.id) as string;
    await db
      .insert(team)
      .values({ id: teamId, eventId, name: t.name, inviteToken: secretToken(24) });
    for (const [i, email] of t.members.entries()) {
      const u = await ensureUser(email, email.split("@")[0] ?? email, password(email));
      if (u.created) created.users = (created.users ?? 0) + 1;
      await db
        .insert(teamMember)
        .values({ teamId, userId: u.id, role: i === 0 ? "owner" : "member" })
        .onConflictDoNothing();
      await db.insert(registration).values({ eventId, userId: u.id }).onConflictDoNothing();
    }
  }
  created.teams = b.teams.length;

  for (const p of b.projects) {
    const content = p.content ?? (p.summary ? textToDoc(p.summary) : null);
    await db.insert(project).values({
      id: projectIds.get(p.id) as string,
      eventId,
      teamId: p.team ? (teamIds.get(p.team) ?? null) : null,
      trackId: trackOf(p.track),
      title: p.title,
      tagline: p.tagline ?? p.summary ?? null,
      content,
      description: docToText(content),
      repoUrl: p.repo_url ?? null,
      liveUrl: p.live_url ?? null,
      videoUrl: p.video_url ?? null,
      thumbnailUrl: p.thumbnail_url ?? null,
      techTags: p.tech_tags,
      status: p.status,
      submittedAt: p.status === "submitted" ? (d(p.submitted_at) ?? new Date()) : null,
    });
  }
  created.projects = b.projects.length;

  // Scores (and the assignment each score implies).
  for (const s of b.scores) {
    const judgeId = judgeUser.get(s.judge);
    const projectId = projectIds.get(s.project);
    if (!judgeId || !projectId) {
      skipped.push(`score ${s.judge}→${s.project}: unknown judge or project`);
      continue;
    }
    await db
      .insert(assignment)
      .values({ id: id.assignment(), eventId, judgeId, projectId })
      .onConflictDoNothing();
    const res = await db
      .insert(score)
      .values({
        id: id.score(),
        eventId,
        judgeId,
        projectId,
        criteria: s.criteria,
        favorite: s.favorite,
        comment: s.comment || null,
      })
      .onConflictDoNothing();
    if (res.rowCount) created.scores = (created.scores ?? 0) + 1;
    else skipped.push(`score ${s.judge}→${s.project}: duplicate`);
  }

  for (const c of b.pairwise) {
    const judgeId = judgeUser.get(c.judge);
    const winnerId = projectIds.get(c.winner);
    const loserId = projectIds.get(c.loser);
    if (!judgeId || !winnerId || !loserId) continue;
    await db
      .insert(pairwiseVote)
      .values({ id: id.pairwise(), eventId, judgeId, winnerId, loserId });
    created.comparisons = (created.comparisons ?? 0) + 1;
  }

  return { eventId, slug, created, skipped };
}

/** Export an event as a bundle (fixtures-compatible). */
export async function exportBundle(e: Event): Promise<Bundle> {
  const [tracks, criteria, prizes, panel, teams, members, projects, scores, comparisons] =
    await Promise.all([
      db.select().from(track).where(eq(track.eventId, e.id)).orderBy(asc(track.position)),
      db
        .select()
        .from(rubricCriterion)
        .where(eq(rubricCriterion.eventId, e.id))
        .orderBy(asc(rubricCriterion.position)),
      db.select().from(prize).where(eq(prize.eventId, e.id)),
      db
        .select({
          userId: eventJudge.userId,
          trackIds: eventJudge.trackIds,
          name: userTable.name,
          email: userTable.email,
        })
        .from(eventJudge)
        .innerJoin(userTable, eq(userTable.id, eventJudge.userId))
        .where(eq(eventJudge.eventId, e.id)),
      db.select().from(team).where(eq(team.eventId, e.id)),
      db
        .select({
          teamId: teamMember.teamId,
          email: userTable.email,
          role: teamMember.role,
          joinedAt: teamMember.joinedAt,
        })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .innerJoin(userTable, eq(userTable.id, teamMember.userId))
        .where(eq(team.eventId, e.id)),
      db.select().from(project).where(eq(project.eventId, e.id)),
      db.select().from(score).where(eq(score.eventId, e.id)),
      db.select().from(pairwiseVote).where(eq(pairwiseVote.eventId, e.id)),
    ]);
  const iso = (x: Date | null) => (x ? x.toISOString() : null);
  // Scores reference judges by bundle id; use the user id so it round-trips.
  const judgeIds = new Set(panel.map((j) => j.userId));
  const extraJudges = [...new Set(scores.map((s) => s.judgeId))].filter((j) => !judgeIds.has(j));
  const extra = extraJudges.length
    ? await db
        .select({ id: userTable.id, name: userTable.name, email: userTable.email })
        .from(userTable)
        .where(inArray(userTable.id, extraJudges))
    : [];

  return {
    format: "juryza.bundle/v1",
    event: {
      id: e.id,
      name: e.name,
      slug: e.slug,
      tagline: e.tagline,
      description: e.description,
      submissions_open: iso(e.submissionsOpen),
      submissions_close: e.submissionsClose.toISOString(),
      judging_close: iso(e.judgingClose),
      voting_open: iso(e.votingOpen),
      voting_close: iso(e.votingClose),
      max_team_size: e.maxTeamSize,
      reviews_per_project: e.reviewsPerProject,
      voting_access: e.votingAccess as "open" | "email" | "authenticated",
      vote_budget: e.voteBudget,
      hue: e.hue,
    },
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    rubric: criteria.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      description: c.description,
    })),
    prizes: prizes.map((p) => ({
      name: p.name,
      kind: p.kind as "overall" | "track" | "community",
      track: p.trackId,
      amount: p.amount,
      rank: p.rank,
      description: p.description,
    })),
    judges: [
      ...panel.map((j) => ({ id: j.userId, name: j.name, email: j.email, tracks: j.trackIds })),
      ...extra.map((j) => ({ id: j.id, name: j.name, email: j.email, tracks: [] })),
    ],
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      members: members
        .filter((m) => m.teamId === t.id)
        .sort((a, b) =>
          a.role === "owner"
            ? -1
            : b.role === "owner"
              ? 1
              : a.joinedAt.getTime() - b.joinedAt.getTime()
        )
        .map((m) => m.email),
    })),
    projects: projects.map((p) => ({
      id: p.id,
      team: p.teamId,
      track: p.trackId,
      title: p.title,
      tagline: p.tagline,
      summary: p.tagline,
      content: p.content,
      repo_url: p.repoUrl,
      live_url: p.liveUrl,
      video_url: p.videoUrl,
      thumbnail_url: p.thumbnailUrl,
      tech_tags: p.techTags,
      status: p.status as "draft" | "submitted",
      submitted_at: iso(p.submittedAt),
    })),
    scores: scores.map((s) => ({
      judge: s.judgeId,
      project: s.projectId,
      criteria: s.criteria,
      favorite: s.favorite,
      comment: s.comment,
    })),
    pairwise: comparisons.map((c) => ({ judge: c.judgeId, winner: c.winnerId, loser: c.loserId })),
  };
}
