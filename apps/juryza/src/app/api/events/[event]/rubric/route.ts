import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db, event, rubricCriterion } from "@/lib/db";
import { id } from "@/lib/ids";
import { audit } from "@/lib/server/audit";
import { isEventCoach, loadEvent, loadManagedEvent } from "@/lib/server/events";
import { badRequest, conflict, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";

type P = { event: string };

/**
 * GET /api/events/:event/rubric — the weighted scoring criteria.
 * PUT /api/events/:event/rubric — replace them. Weights are relative (they are
 *     normalized to sum to 1 when scores are computed), so re-weighting never
 *     invalidates marks already given: results recompute on read. Rows are
 *     matched by `key`, which is what judges' marks are stored against.
 */

const list = (eventId: string) =>
  db
    .select()
    .from(rubricCriterion)
    .where(eq(rubricCriterion.eventId, eventId))
    .orderBy(asc(rubricCriterion.position));

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  const coach = me ? me.role === "admin" || (await isEventCoach(e.id, me.userId)) : false;
  const locked = e.workflow === "innolab" && e.pitchSelectionFinalizedAt !== null;
  return {
    criteria: await list(e.id),
    revision: e.rubricRevision,
    locked,
    editable: coach && !locked,
  };
});

const body = z.object({
  revision: z.number().int().nonnegative(),
  criteria: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{0,31}$/, "Keys are lowercase identifiers, e.g. code_quality"),
        label: z.string().trim().min(1).max(60),
        description: z.string().trim().max(400).nullish(),
        weight: z.number().positive().max(100),
      })
    )
    .min(1, "A rubric needs at least one criterion")
    .max(12),
});

export const PUT = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  if (e.workflow === "innolab" && e.pitchSelectionFinalizedAt) {
    throw forbidden("La grille est verrouillée depuis la Promotion");
  }
  const { criteria, revision } = await readBody(req, body);
  if (new Set(criteria.map((c) => c.key)).size !== criteria.length) {
    throw badRequest("Each criterion needs a unique key");
  }

  await db.transaction(async (tx) => {
    const [revisionRow] = await tx
      .update(event)
      .set({ rubricRevision: revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(event.id, e.id),
          eq(event.rubricRevision, revision),
          e.workflow === "innolab" ? isNull(event.pitchSelectionFinalizedAt) : undefined
        )
      )
      .returning({ revision: event.rubricRevision });
    if (!revisionRow) {
      throw conflict("La grille a été modifiée ou verrouillée. Rechargez-la avant de réessayer.");
    }
    const keys = criteria.map((c) => c.key);
    await tx
      .delete(rubricCriterion)
      .where(and(eq(rubricCriterion.eventId, e.id), notInArray(rubricCriterion.key, keys)));
    const existing = await tx
      .select({ key: rubricCriterion.key })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.eventId, e.id));
    const have = new Set(existing.map((c) => c.key));
    for (const [position, c] of criteria.entries()) {
      const values = {
        label: c.label,
        description: c.description ?? null,
        weight: c.weight,
        position,
      };
      if (have.has(c.key)) {
        await tx
          .update(rubricCriterion)
          .set(values)
          .where(and(eq(rubricCriterion.eventId, e.id), eq(rubricCriterion.key, c.key)));
      } else {
        await tx
          .insert(rubricCriterion)
          .values({ id: id.criterion(), eventId: e.id, key: c.key, ...values });
      }
    }
  });

  await audit({
    eventId: e.id,
    actor: me,
    action: "rubric.updated",
    detail: { weights: Object.fromEntries(criteria.map((c) => [c.key, c.weight])) },
    req,
  });
  return {
    criteria: await list(e.id),
    revision: revision + 1,
    locked: false,
    editable: true,
  };
});
