import { and, asc, desc, eq } from "drizzle-orm";

import type { Event } from "@/lib/db";
import {
  assignment,
  auditLog,
  comment,
  db,
  project,
  registration,
  rubricCriterion,
  score,
  team,
  teamMember,
  track,
  user as userTable,
  vote,
} from "@/lib/db";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { computeResults } from "@/lib/server/results";

/**
 * Every export an organizer can download, at every stage of the event. Each
 * dataset is a header row plus data rows, rendered as CSV or JSON by the route.
 */

export const DATASETS = [
  "participants",
  "teams",
  "projects",
  "assignments",
  "scores",
  "results",
  "votes",
  "comments",
  "audit",
] as const;
export type Dataset = (typeof DATASETS)[number];

export async function buildDataset(
  e: Event,
  dataset: Dataset
): Promise<{ headers: string[]; rows: unknown[][] }> {
  switch (dataset) {
    case "participants": {
      const rows = await db
        .select({
          id: userTable.id,
          name: userTable.name,
          email: userTable.email,
          username: userTable.username,
          registeredAt: registration.createdAt,
          teamName: team.name,
        })
        .from(registration)
        .innerJoin(userTable, eq(userTable.id, registration.userId))
        .leftJoin(teamMember, eq(teamMember.userId, userTable.id))
        .leftJoin(team, and(eq(team.id, teamMember.teamId), eq(team.eventId, e.id)))
        .where(eq(registration.eventId, e.id))
        .orderBy(asc(userTable.name));
      // A user can be on teams in other events; keep only this event's team (or none).
      const seen = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!seen.has(r.id) || r.teamName) seen.set(r.id, r);
      return {
        headers: ["user_id", "name", "email", "username", "registered_at", "team"],
        rows: [...seen.values()].map((r) => [
          r.id,
          r.name,
          r.email,
          r.username,
          r.registeredAt,
          r.teamName,
        ]),
      };
    }
    case "teams": {
      const rows = await db
        .select({
          teamId: team.id,
          teamName: team.name,
          name: userTable.name,
          email: userTable.email,
          role: teamMember.role,
        })
        .from(team)
        .leftJoin(teamMember, eq(teamMember.teamId, team.id))
        .leftJoin(userTable, eq(userTable.id, teamMember.userId))
        .where(eq(team.eventId, e.id))
        .orderBy(asc(team.name));
      return {
        headers: ["team_id", "team", "member", "email", "role"],
        rows: rows.map((r) => [r.teamId, r.teamName, r.name, r.email, r.role]),
      };
    }
    case "projects": {
      const rows = await db
        .select({ p: project, trackName: track.name, teamName: team.name })
        .from(project)
        .leftJoin(track, eq(track.id, project.trackId))
        .leftJoin(team, eq(team.id, project.teamId))
        .where(eq(project.eventId, e.id))
        .orderBy(asc(project.title));
      return {
        headers: [
          "project_id",
          "title",
          "tagline",
          "status",
          ...(EVENT_TRACKS_ENABLED ? ["track"] : []),
          "team",
          "repo_url",
          "live_url",
          "video_url",
          "tech_tags",
          "submitted_at",
          "updated_at",
        ],
        rows: rows.map(({ p, trackName, teamName }) => [
          p.id,
          p.title,
          p.tagline,
          p.status,
          ...(EVENT_TRACKS_ENABLED ? [trackName] : []),
          teamName,
          p.repoUrl,
          p.liveUrl,
          p.videoUrl,
          p.techTags.join("; "),
          p.submittedAt,
          p.updatedAt,
        ]),
      };
    }
    case "assignments": {
      const rows = await db
        .select({
          judge: userTable.name,
          email: userTable.email,
          projectId: project.id,
          title: project.title,
          batch: assignment.batch,
          scoreId: score.id,
        })
        .from(assignment)
        .innerJoin(userTable, eq(userTable.id, assignment.judgeId))
        .innerJoin(project, eq(project.id, assignment.projectId))
        .leftJoin(
          score,
          and(eq(score.judgeId, assignment.judgeId), eq(score.projectId, assignment.projectId))
        )
        .where(eq(assignment.eventId, e.id))
        .orderBy(asc(userTable.name), asc(project.title));
      return {
        headers: ["judge", "judge_email", "project_id", "project", "batch", "scored"],
        rows: rows.map((r) => [
          r.judge,
          r.email,
          r.projectId,
          r.title,
          r.batch,
          r.scoreId ? "yes" : "no",
        ]),
      };
    }
    case "scores": {
      const [criteria, rows] = await Promise.all([
        db
          .select()
          .from(rubricCriterion)
          .where(eq(rubricCriterion.eventId, e.id))
          .orderBy(asc(rubricCriterion.position)),
        db
          .select({
            judge: userTable.name,
            judgeId: score.judgeId,
            projectId: score.projectId,
            title: project.title,
            criteria: score.criteria,
            favorite: score.favorite,
            comment: score.comment,
            updatedAt: score.updatedAt,
          })
          .from(score)
          .innerJoin(userTable, eq(userTable.id, score.judgeId))
          .innerJoin(project, eq(project.id, score.projectId))
          .where(eq(score.eventId, e.id))
          .orderBy(asc(project.title), asc(userTable.name)),
      ]);
      return {
        headers: [
          "judge",
          "judge_id",
          "project_id",
          "project",
          ...criteria.map((c) => c.key),
          "favorite",
          "comment",
          "updated_at",
        ],
        rows: rows.map((r) => [
          r.judge,
          r.judgeId,
          r.projectId,
          r.title,
          ...criteria.map((c) => r.criteria[c.key] ?? ""),
          r.favorite ? "yes" : "no",
          r.comment,
          r.updatedAt,
        ]),
      };
    }
    case "results": {
      const res = await computeResults(e);
      const fmt = (x: number | null) => (x === null ? "" : x.toFixed(4));
      return {
        headers: [
          "rank",
          "project_id",
          "title",
          "team",
          ...(EVENT_TRACKS_ENABLED ? ["track", "track_rank"] : []),
          "reviews",
          "favorites",
          "raw_mean",
          "normalized_mean",
          "raw_rank",
          ...res.criteria.map((c) => `mean_${c.key}`),
          "community_votes",
          "voters",
          "pairwise_strength",
          "awards",
        ],
        rows: res.projects.map((p) => [
          p.rank ?? "",
          p.id,
          p.title,
          p.teamName,
          ...(EVENT_TRACKS_ENABLED ? [p.trackName, p.trackRank ?? ""] : []),
          p.reviews,
          p.favorites,
          fmt(p.raw),
          fmt(p.normalized),
          p.rawRank ?? "",
          ...res.criteria.map((c) => fmt(p.criteria[c.key] ?? null)),
          p.votes,
          p.voters,
          p.pairwise ? p.pairwise.strength.toFixed(4) : "",
          p.awards.map((a) => a.name).join("; "),
        ]),
      };
    }
    case "votes": {
      const rows = await db
        .select({
          projectId: vote.projectId,
          title: project.title,
          voterKey: vote.voterKey,
          votes: vote.votes,
          ip: vote.ipAddress,
          at: vote.updatedAt,
        })
        .from(vote)
        .innerJoin(project, eq(project.id, vote.projectId))
        .where(eq(vote.eventId, e.id))
        .orderBy(asc(project.title));
      return {
        headers: [
          "project_id",
          "project",
          "voter",
          "votes",
          "credits_spent",
          "ip_address",
          "cast_at",
        ],
        rows: rows.map((r) => [
          r.projectId,
          r.title,
          r.voterKey,
          r.votes,
          r.votes * r.votes,
          r.ip,
          r.at,
        ]),
      };
    }
    case "comments": {
      const rows = await db
        .select({
          projectId: comment.projectId,
          title: project.title,
          author: comment.authorName,
          body: comment.body,
          at: comment.createdAt,
        })
        .from(comment)
        .innerJoin(project, eq(project.id, comment.projectId))
        .where(eq(comment.eventId, e.id))
        .orderBy(asc(comment.createdAt));
      return {
        headers: ["project_id", "project", "author", "comment", "posted_at"],
        rows: rows.map((r) => [r.projectId, r.title, r.author, r.body, r.at]),
      };
    }
    case "audit": {
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.eventId, e.id))
        .orderBy(desc(auditLog.createdAt));
      return {
        headers: ["at", "actor", "role", "action", "target", "detail", "ip_address"],
        rows: rows.map((r) => [
          r.createdAt,
          r.actorName ?? r.actorId,
          r.actorRole,
          r.action,
          r.target,
          r.detail ? JSON.stringify(r.detail) : "",
          r.ipAddress,
        ]),
      };
    }
  }
}
