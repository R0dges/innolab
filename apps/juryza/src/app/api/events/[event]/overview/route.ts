import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  assignment,
  auditLog,
  comment,
  db,
  eventJudge,
  project,
  registration,
  score,
  team,
  track,
  user as userTable,
  vote,
} from "@/lib/db";
import { phaseOf } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { loadManagedEvent } from "@/lib/server/events";
import { handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

/**
 * GET /api/events/:event/overview — the organizer's live dashboard: headline
 * counts, submissions per day, projects per track, per-judge progress (who has
 * not started), and the latest audit entries.
 */
export const GET = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const count = (table: PgTable, where: SQL | undefined) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(where)
      .then((r) => r[0]?.n ?? 0);

  const [
    registrations,
    teams,
    submitted,
    drafts,
    judges,
    assignments,
    scores,
    voters,
    comments,
    perDay,
    perTrack,
    judgeProgress,
    activity,
  ] = await Promise.all([
    count(registration, eq(registration.eventId, e.id)),
    count(team, eq(team.eventId, e.id)),
    count(project, and(eq(project.eventId, e.id), eq(project.status, "submitted"))),
    count(project, and(eq(project.eventId, e.id), eq(project.status, "draft"))),
    count(eventJudge, eq(eventJudge.eventId, e.id)),
    count(assignment, eq(assignment.eventId, e.id)),
    count(score, eq(score.eventId, e.id)),
    db
      .select({ n: sql<number>`count(distinct ${vote.voterKey})::int` })
      .from(vote)
      .where(eq(vote.eventId, e.id))
      .then((r) => r[0]?.n ?? 0),
    count(comment, eq(comment.eventId, e.id)),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${project.submittedAt}), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(project)
      .where(and(eq(project.eventId, e.id), eq(project.status, "submitted")))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    EVENT_TRACKS_ENABLED
      ? db
          .select({
            trackId: track.id,
            name: track.name,
            n: sql<number>`count(${project.id})::int`,
          })
          .from(track)
          .leftJoin(project, and(eq(project.trackId, track.id), eq(project.status, "submitted")))
          .where(eq(track.eventId, e.id))
          .groupBy(track.id, track.name, track.position)
          .orderBy(track.position)
      : Promise.resolve([]),
    db
      .select({
        judgeId: userTable.id,
        name: userTable.name,
        username: userTable.username,
        assigned: sql<number>`(select count(*)::int from ${assignment} where ${assignment.eventId} = ${e.id} and ${assignment.judgeId} = ${userTable.id})`,
        scored: sql<number>`(select count(*)::int from ${score} where ${score.eventId} = ${e.id} and ${score.judgeId} = ${userTable.id})`,
      })
      .from(eventJudge)
      .innerJoin(userTable, eq(userTable.id, eventJudge.userId))
      .where(eq(eventJudge.eventId, e.id)),
    db
      .select()
      .from(auditLog)
      .where(eq(auditLog.eventId, e.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(12),
  ]);

  return {
    event: e,
    phase: phaseOf(e),
    totals: {
      registrations,
      teams,
      submitted,
      drafts,
      judges,
      assignments,
      scores,
      voters,
      comments,
    },
    submissionsPerDay: perDay,
    projectsPerTrack: perTrack,
    judgeProgress: judgeProgress.sort(
      (a, b) => a.scored / (a.assigned || 1) - b.scored / (b.assigned || 1)
    ),
    activity,
  };
});
