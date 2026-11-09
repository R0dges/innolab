import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  event,
  platformSetting,
  project,
  registration,
  resultPublication,
  teamMember,
} from "@/lib/db";
import { id } from "@/lib/ids";
import { votingIsOpen } from "@/lib/phase";
import { audit } from "@/lib/server/audit";
import { isEventCoach, loadEvent, loadManagedEvent } from "@/lib/server/events";
import { forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { computeResults } from "@/lib/server/results";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET  /api/events/:event/results — the leaderboard: normalized judged
 *      ranking, per-criterion means, track ranks, community votes, pairwise
 *      strength and prize winners. Hidden from everyone but the event's
 *      organizers until they publish; before that, the public response carries
 *      no numbers at all.
 * POST /api/events/:event/results { published, closeVoting? } — publish or
 *      unpublish. Publishing is refused while community voting is still open
 *      (results must never leak into a live vote) unless `closeVoting: true`,
 *      which ends the voting window now.
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  const manager = me.role === "admin" || (await isEventCoach(e.id, me.userId));
  if (!e.resultsPublished && !manager) {
    return { published: false, event: { slug: e.slug, name: e.name } };
  }
  if (e.resultsPublished && !manager) {
    const [setting] = await db
      .select({ value: platformSetting.value })
      .from(platformSetting)
      .where(eq(platformSetting.key, "archive-results-visibility"))
      .limit(1);
    const scope = setting?.value ?? "all-active";
    if (scope === "same-location" && (!me.location || me.location !== e.location)) {
      throw forbidden("Ces résultats sont réservés aux comptes du même lieu");
    }
    if (scope === "event-participants") {
      const [registered] = await db
        .select({ userId: registration.userId })
        .from(registration)
        .where(and(eq(registration.eventId, e.id), eq(registration.userId, me.userId)))
        .limit(1);
      if (!registered)
        throw forbidden("Ces résultats sont réservés aux participants de l'événement");
    }
  }
  const [publication] = e.resultsPublished
    ? await db
        .select()
        .from(resultPublication)
        .where(and(eq(resultPublication.eventId, e.id), eq(resultPublication.isCurrent, true)))
        .orderBy(desc(resultPublication.version))
        .limit(1)
    : [];
  const results = (publication?.snapshot ?? (await computeResults(e))) as Awaited<
    ReturnType<typeof computeResults>
  >;
  const projectIds = results.projects.map((row) => row.id);
  const memberships = projectIds.length
    ? await db
        .select({ projectId: project.id })
        .from(project)
        .innerJoin(teamMember, eq(teamMember.teamId, project.teamId))
        .where(and(inArray(project.id, projectIds), eq(teamMember.userId, me.userId)))
    : [];
  const memberProjectIds = new Set(memberships.map((membership) => membership.projectId));
  const visibleResults = {
    ...results,
    projects: results.projects.map((row) => ({
      ...row,
      consensusComment: memberProjectIds.has(row.id) ? row.consensusComment : undefined,
    })),
  };
  return {
    published: e.resultsPublished,
    preview: !e.resultsPublished,
    version: publication?.version ?? null,
    publishedAt: publication?.publishedAt ?? null,
    event: { slug: e.slug, name: e.name },
    ...visibleResults,
    // Per-judge calibration is organizer-only: it identifies judges.
    judges: manager ? visibleResults.judges : undefined,
  };
});

const body = z.object({ published: z.boolean(), closeVoting: z.boolean().default(false) });

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const { published, closeVoting } = await readBody(req, body);

  if (!published && me.role !== "admin") {
    throw forbidden("Seul un administrateur peut rouvrir des résultats publiés");
  }

  if (published && (!e.judgingClose || Date.now() < e.judgingClose.getTime())) {
    throw forbidden("Jury deliberations must close before results can be published");
  }
  if (published && votingIsOpen(e) && !closeVoting) {
    throw forbidden("Community voting is still open. Close voting before publishing results.");
  }
  const snapshot = published ? await computeResults(e) : null;
  let version: number | null = null;
  await db.transaction(async (tx) => {
    if (published && snapshot) {
      const [latest] = await tx
        .select({ version: resultPublication.version })
        .from(resultPublication)
        .where(eq(resultPublication.eventId, e.id))
        .orderBy(desc(resultPublication.version))
        .limit(1);
      version = (latest?.version ?? 0) + 1;
      await tx
        .update(resultPublication)
        .set({ isCurrent: false })
        .where(eq(resultPublication.eventId, e.id));
      await tx.insert(resultPublication).values({
        id: id.resultPublication(),
        eventId: e.id,
        version,
        snapshot,
        publishedBy: me.userId,
        isCurrent: true,
      });
    }
    await tx
      .update(event)
      .set({
        resultsPublished: published,
        ...(published && votingIsOpen(e) && { votingClose: new Date() }),
        ...(!published && { judgingClose: null }),
        updatedAt: new Date(),
      })
      .where(eq(event.id, e.id));
  });

  await audit({
    eventId: e.id,
    actor: me,
    action: published ? "results.published" : "results.unpublished",
    detail: { version },
    req,
  });
  if (published) dispatch("results.published", { name: e.name, slug: e.slug }, e.id);
  return { published, version };
});
