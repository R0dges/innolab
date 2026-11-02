import type { NextRequest } from "next/server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { assignment, db, event, eventJudge, project, rubricCriterion, score } from "@/lib/db";
import { id } from "@/lib/ids";
import { rawScore } from "@/lib/scoring";
import { audit } from "@/lib/server/audit";
import { findEvent } from "@/lib/server/events";
import { badRequest, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import type { Identity } from "@/lib/server/identity";
import { requireUser } from "@/lib/server/identity";
import { dispatch } from "@/lib/server/webhooks";

/**
 * A judge's own scores — the role-isolation boundary.
 *
 * GET  /api/judge/scores[?event=<slug|id>][&judge=<username|id>]
 *      Returns the caller's scores. `judge` names whose scores to return, and
 *      the only accepted value is the caller: asking for anyone else is a 403
 *      decided here, before a row is read — there is no code path that returns
 *      judge A's rows to judge B. Callers who sit on no judging panel (e.g. a
 *      participant) get 403 as well.
 * POST /api/judge/scores { projectId, criteria, favorite, comment }
 *      Save (or update) the caller's score. Only for a project assigned to the
 *      caller, only with marks for the event's rubric, and only while judging
 *      is open (before `judgingClose` and before results are published). At
 *      most one score per caller and event may carry the favourite bonus.
 */

async function assertJudge(me: Identity) {
  if (me.role === "judge") return;
  const [panel] = await db
    .select({ eventId: eventJudge.eventId })
    .from(eventJudge)
    .where(eq(eventJudge.userId, me.userId))
    .limit(1);
  if (!panel) throw forbidden("Only judges can read judge scores");
}

export const GET = handle(async (req: NextRequest) => {
  const me = await requireUser(req);
  await assertJudge(me);

  const url = new URL(req.url);
  const requested = url.searchParams.get("judge");
  if (requested && requested !== me.userId && requested !== me.username) {
    await audit({
      actor: me,
      action: "judge.scores.denied",
      target: requested,
      detail: { reason: "attempted to read another judge's scores" },
      req,
    });
    throw forbidden("A judge may only read their own scores");
  }

  const eventRef = url.searchParams.get("event");
  const scopedEvent = eventRef ? await findEvent(eventRef) : null;
  if (eventRef && !scopedEvent) throw notFound("Event not found");

  const rows = await db
    .select({
      id: score.id,
      eventId: score.eventId,
      eventSlug: event.slug,
      projectId: score.projectId,
      projectTitle: project.title,
      criteria: score.criteria,
      favorite: score.favorite,
      comment: score.comment,
      updatedAt: score.updatedAt,
    })
    .from(score)
    .innerJoin(project, eq(project.id, score.projectId))
    .innerJoin(event, eq(event.id, score.eventId))
    .where(
      and(eq(score.judgeId, me.userId), scopedEvent ? eq(score.eventId, scopedEvent.id) : undefined)
    );

  const eventIds = [...new Set(rows.map((r) => r.eventId))];
  const rubrics = eventIds.length
    ? await db
        .select({
          eventId: rubricCriterion.eventId,
          key: rubricCriterion.key,
          weight: rubricCriterion.weight,
        })
        .from(rubricCriterion)
        .where(inArray(rubricCriterion.eventId, eventIds))
    : [];

  return {
    judge: { id: me.userId, username: me.username, name: me.name },
    scores: rows.map((r) => ({
      ...r,
      weighted: rawScore(
        r.criteria,
        rubrics.filter((c) => c.eventId === r.eventId),
        r.favorite
      ),
    })),
  };
});

const body = z.object({
  projectId: z.string().min(1),
  criteria: z.record(z.string(), z.number().int().min(1).max(5)),
  favorite: z.boolean().default(false),
  comment: z.string().trim().max(4000).nullish(),
});

export const POST = handle(async (req: NextRequest) => {
  const me = await requireUser(req);
  const b = await readBody(req, body);

  const [assigned] = await db
    .select({ event })
    .from(assignment)
    .innerJoin(event, eq(event.id, assignment.eventId))
    .innerJoin(
      eventJudge,
      and(eq(eventJudge.eventId, assignment.eventId), eq(eventJudge.userId, assignment.judgeId))
    )
    .where(and(eq(assignment.judgeId, me.userId), eq(assignment.projectId, b.projectId)))
    .limit(1);
  if (!assigned) throw forbidden("That project is not assigned to you");
  const e = assigned.event;

  if (e.resultsPublished) throw forbidden("Results are published; scores are final");
  if (e.judgingClose && Date.now() >= e.judgingClose.getTime())
    throw forbidden("Judging has closed for this event");

  const rubric = await db
    .select({ key: rubricCriterion.key })
    .from(rubricCriterion)
    .where(eq(rubricCriterion.eventId, e.id));
  const keys = new Set(rubric.map((c) => c.key));
  const unknown = Object.keys(b.criteria).filter((k) => !keys.has(k));
  const missing = [...keys].filter((k) => b.criteria[k] === undefined);
  if (unknown.length) throw badRequest(`Unknown criteria: ${unknown.join(", ")}`);
  if (missing.length) throw badRequest(`Score every criterion (missing: ${missing.join(", ")})`);

  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    if (b.favorite) {
      await tx
        .update(score)
        .set({ favorite: false, updatedAt })
        .where(
          and(
            eq(score.eventId, e.id),
            eq(score.judgeId, me.userId),
            eq(score.favorite, true)
          )
        );
    }

    await tx
      .insert(score)
      .values({
        id: id.score(),
        eventId: e.id,
        judgeId: me.userId,
        projectId: b.projectId,
        criteria: b.criteria,
        favorite: b.favorite,
        comment: b.comment ?? null,
      })
      .onConflictDoUpdate({
        target: [score.judgeId, score.projectId],
        set: {
          criteria: b.criteria,
          favorite: b.favorite,
          comment: b.comment ?? null,
          updatedAt,
        },
      });
  });

  await audit({
    eventId: e.id,
    actor: me,
    action: "score.saved",
    target: b.projectId,
    detail: { criteria: b.criteria, favorite: b.favorite },
    req,
  });
  dispatch(
    "score.saved",
    { projectId: b.projectId, judgeId: me.userId, favorite: b.favorite },
    e.id
  );
  return { ok: true };
});
