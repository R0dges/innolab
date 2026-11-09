import { and, eq, notExists } from "drizzle-orm";
import { z } from "zod";

import { balanced, batched, coverage } from "@/lib/assignment";
import { assignment, db, project, score, user as userTable } from "@/lib/db";
import { id } from "@/lib/ids";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { audit } from "@/lib/server/audit";
import { loadManagedEvent } from "@/lib/server/events";
import { handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { existingAssignments, panelForPlanning, submittedProjects } from "@/lib/server/judging";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET    /api/events/:event/assignments — every assignment with judge, project
 *        and whether it has been scored (organizers).
 * POST   /api/events/:event/assignments — plan and (unless `dryRun`) write
 *        assignments. `strategy: "balanced" | "batch"`. Re-running tops up
 *        coverage; it never duplicates. See lib/assignment.ts and JUDGING.md.
 * DELETE /api/events/:event/assignments — release every unscored assignment.
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const rows = await db
    .select({
      id: assignment.id,
      batch: assignment.batch,
      judgeId: assignment.judgeId,
      judgeName: userTable.name,
      projectId: assignment.projectId,
      projectTitle: project.title,
      trackId: project.trackId,
      scoreId: score.id,
      scoredAt: score.updatedAt,
    })
    .from(assignment)
    .innerJoin(userTable, eq(userTable.id, assignment.judgeId))
    .innerJoin(project, eq(project.id, assignment.projectId))
    .leftJoin(
      score,
      and(eq(score.judgeId, assignment.judgeId), eq(score.projectId, assignment.projectId))
    )
    .where(eq(assignment.eventId, e.id));
  const projects = await submittedProjects(e.id);
  return {
    reviewsPerProject: e.reviewsPerProject,
    coverage: coverage(projects, rows, e.reviewsPerProject),
    assignments: rows.map(({ scoreId, ...r }) => ({
      ...r,
      trackId: EVENT_TRACKS_ENABLED ? r.trackId : null,
      scored: scoreId !== null,
    })),
  };
});

const body = z.object({
  strategy: z.enum(["balanced", "batch"]).default("balanced"),
  reviewsPerProject: z.number().int().min(1).max(10).optional(),
  dryRun: z.boolean().default(false),
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const b = await readBody(req, body);
  const target = b.reviewsPerProject ?? e.reviewsPerProject;

  const [judges, projects, existing] = await Promise.all([
    panelForPlanning(e.id),
    submittedProjects(e.id),
    existingAssignments(e.id),
  ]);
  const pairs =
    b.strategy === "batch"
      ? batched(judges, projects)
      : balanced(judges, projects, target, existing);
  const plan = {
    strategy: b.strategy,
    reviewsPerProject: target,
    judges: judges.length,
    pairs: pairs.length,
  };

  if (b.dryRun) {
    return { ...plan, dryRun: true, coverage: coverage(projects, [...existing, ...pairs], target) };
  }

  let inserted = 0;
  if (pairs.length) {
    const res = await db
      .insert(assignment)
      .values(pairs.map((p) => ({ id: id.assignment(), eventId: e.id, ...p })))
      .onConflictDoNothing();
    inserted = res.rowCount ?? 0;
  }
  await audit({
    eventId: e.id,
    actor: me,
    action: "assignments.generated",
    detail: { ...plan, inserted },
    req,
  });
  dispatch("assignments.generated", { ...plan, inserted }, e.id);
  return {
    ...plan,
    inserted,
    coverage: coverage(projects, await existingAssignments(e.id), target),
  };
});

export const DELETE = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const res = await db.delete(assignment).where(
    and(
      eq(assignment.eventId, e.id),
      notExists(
        db
          .select({ id: score.id })
          .from(score)
          .where(
            and(eq(score.judgeId, assignment.judgeId), eq(score.projectId, assignment.projectId))
          )
      )
    )
  );
  await audit({
    eventId: e.id,
    actor: me,
    action: "assignments.cleared",
    detail: { removed: res.rowCount },
    req,
  });
  return { removed: res.rowCount ?? 0 };
});
