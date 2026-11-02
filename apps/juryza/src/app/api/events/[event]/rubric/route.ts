import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db, rubricCriterion } from "@/lib/db";
import { id } from "@/lib/ids";
import { audit } from "@/lib/server/audit";
import { loadEvent, loadManagedEvent } from "@/lib/server/events";
import { badRequest, handle, readBody } from "@/lib/server/http";
import { requireRole, resolveIdentity } from "@/lib/server/identity";

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
  const e = await loadEvent(ref, await resolveIdentity(req));
  return { criteria: await list(e.id) };
});

const body = z.object({
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
  const me = await requireRole(req, "admin");
  const e = await loadManagedEvent(ref, me);
  const { criteria } = await readBody(req, body);
  if (new Set(criteria.map((c) => c.key)).size !== criteria.length) {
    throw badRequest("Each criterion needs a unique key");
  }

  await db.transaction(async (tx) => {
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
  return { criteria: await list(e.id) };
});
