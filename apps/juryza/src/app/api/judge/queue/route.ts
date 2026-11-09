import type { NextRequest } from "next/server";

import { and, asc, eq, sql } from "drizzle-orm";

import {
  assignment,
  coachFavorite,
  collectiveScore,
  db,
  event,
  eventJudge,
  project,
  rubricCriterion,
  score,
  track,
} from "@/lib/db";
import { judgingIsOpen } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { findEvent } from "@/lib/server/events";
import { forbidden, handle, notFound } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

/**
 * GET /api/judge/queue — the events the caller judges, with progress.
 * GET /api/judge/queue?event=<slug> — the caller's assigned projects in one
 *     event (with their own score, if any) and the event's rubric. Scoped to
 *     `assignment.judgeId = caller`; there is no parameter to see anyone else's.
 */
export const GET = handle(async (req: NextRequest) => {
  const me = await requireUser(req);
  const ref = new URL(req.url).searchParams.get("event");

  if (!ref) {
    const events = await db
      .select({
        id: event.id,
        slug: event.slug,
        name: event.name,
        hue: event.hue,
        judgingOpen: event.judgingOpen,
        judgingClose: event.judgingClose,
        submissionsClose: event.submissionsClose,
        resultsPublished: event.resultsPublished,
        workflow: event.workflow,
        assigned: sql<number>`case when ${event.workflow} = 'innolab' then (select count(*)::int from ${project} where ${project.eventId} = ${event.id} and ${project.status} = 'submitted') else (select count(*)::int from ${assignment} where ${assignment.eventId} = ${event.id} and ${assignment.judgeId} = ${me.userId}) end`,
        scored: sql<number>`case when ${event.workflow} = 'innolab' then (select count(*)::int from ${collectiveScore} where ${collectiveScore.eventId} = ${event.id}) else (select count(*)::int from ${score} where ${score.eventId} = ${event.id} and ${score.judgeId} = ${me.userId}) end`,
      })
      .from(eventJudge)
      .innerJoin(event, eq(event.id, eventJudge.eventId))
      .where(eq(eventJudge.userId, me.userId))
      .orderBy(asc(event.submissionsClose));
    return { events };
  }

  const e = await findEvent(ref);
  if (!e) throw notFound("Event not found");
  const [panel] = await db
    .select({ trackIds: eventJudge.trackIds })
    .from(eventJudge)
    .where(and(eq(eventJudge.eventId, e.id), eq(eventJudge.userId, me.userId)))
    .limit(1);
  if (!panel) throw forbidden("You are not on this event's judging panel");

  if (e.workflow === "innolab") {
    const [items, criteria, [favorite]] = await Promise.all([
      db
        .select({
          projectId: project.id,
          title: project.title,
          tagline: project.tagline,
          description: project.description,
          content: project.content,
          thumbnailUrl: project.thumbnailUrl,
          repoUrl: project.repoUrl,
          liveUrl: project.liveUrl,
          videoUrl: project.videoUrl,
          techTags: project.techTags,
          trackName: track.name,
          criteria: collectiveScore.criteria,
          comment: collectiveScore.comment,
          revision: collectiveScore.revision,
          scoredAt: collectiveScore.updatedAt,
        })
        .from(project)
        .leftJoin(track, eq(track.id, project.trackId))
        .leftJoin(collectiveScore, eq(collectiveScore.projectId, project.id))
        .where(and(eq(project.eventId, e.id), eq(project.status, "submitted")))
        .orderBy(asc(project.title)),
      db
        .select()
        .from(rubricCriterion)
        .where(eq(rubricCriterion.eventId, e.id))
        .orderBy(asc(rubricCriterion.position)),
      db
        .select({ projectId: coachFavorite.projectId })
        .from(coachFavorite)
        .where(and(eq(coachFavorite.eventId, e.id), eq(coachFavorite.coachId, me.userId)))
        .limit(1),
    ]);
    const now = Date.now();
    const judgingStartsAt = e.judgingOpen ?? e.submissionsClose;
    const status =
      e.resultsPublished || (e.judgingClose !== null && now >= e.judgingClose.getTime())
        ? "closed"
        : judgingIsOpen(e, now)
          ? "open"
          : "upcoming";
    return {
      collective: true,
      event: {
        id: e.id,
        slug: e.slug,
        name: e.name,
        judgingOpen: judgingStartsAt,
        judgingClose: e.judgingClose,
        hue: e.hue,
      },
      status,
      locked: status !== "open",
      criteria,
      total: items.length,
      scored: items.filter((item) => item.scoredAt !== null).length,
      items: items.map((item) => ({
        ...item,
        batch: 1,
        favorite: favorite?.projectId === item.projectId,
        trackName: EVENT_TRACKS_ENABLED ? item.trackName : null,
        scored: item.scoredAt !== null,
      })),
    };
  }

  const [items, criteria] = await Promise.all([
    db
      .select({
        projectId: project.id,
        title: project.title,
        tagline: project.tagline,
        description: project.description,
        content: project.content,
        thumbnailUrl: project.thumbnailUrl,
        repoUrl: project.repoUrl,
        liveUrl: project.liveUrl,
        videoUrl: project.videoUrl,
        techTags: project.techTags,
        trackName: track.name,
        batch: assignment.batch,
        criteria: score.criteria,
        favorite: score.favorite,
        comment: score.comment,
        scoredAt: score.updatedAt,
      })
      .from(assignment)
      .innerJoin(project, eq(project.id, assignment.projectId))
      .leftJoin(track, eq(track.id, project.trackId))
      .leftJoin(
        score,
        and(eq(score.projectId, assignment.projectId), eq(score.judgeId, assignment.judgeId))
      )
      .where(and(eq(assignment.eventId, e.id), eq(assignment.judgeId, me.userId)))
      .orderBy(asc(assignment.batch), asc(project.title)),
    db
      .select()
      .from(rubricCriterion)
      .where(eq(rubricCriterion.eventId, e.id))
      .orderBy(asc(rubricCriterion.position)),
  ]);

  const now = Date.now();
  const judgingStartsAt = e.judgingOpen ?? e.submissionsClose;
  const status =
    e.resultsPublished || (e.judgingClose !== null && now >= e.judgingClose.getTime())
      ? "closed"
      : judgingIsOpen(e, now)
        ? "open"
        : "upcoming";
  return {
    event: {
      id: e.id,
      slug: e.slug,
      name: e.name,
      judgingOpen: judgingStartsAt,
      judgingClose: e.judgingClose,
      hue: e.hue,
    },
    status,
    locked: status !== "open",
    criteria,
    total: items.length,
    scored: items.filter((i) => i.scoredAt !== null).length,
    items: items.map((i) => ({
      ...i,
      trackName: EVENT_TRACKS_ENABLED ? i.trackName : null,
      scored: i.scoredAt !== null,
    })),
  };
});
