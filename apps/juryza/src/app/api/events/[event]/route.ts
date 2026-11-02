import { asc, eq, sql } from "drizzle-orm";

import {
  db,
  event,
  eventJudge,
  prize,
  project,
  registration,
  rubricCriterion,
  team,
  track,
  user as userTable,
} from "@/lib/db";
import { docToText } from "@/lib/rich-text";
import { INTERNAL_INNOLAB_ONLY } from "@/lib/platform";
import { announcementsForEvent } from "@/lib/server/announcements";
import { audit } from "@/lib/server/audit";
import { loadEvent, loadManagedEvent, viewerForEvent } from "@/lib/server/events";
import { badRequest, conflict, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { eventPatch } from "@/lib/server/schemas";
import { innolabScheduleIssue, toDate } from "@/lib/server/validation";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET    /api/events/:event — the event with tracks, prizes, rubric, judging
 *        panel, pinned announcements, counts, and the caller's relationship to
 *        it (registered? team? judge? manager?).
 * PATCH  /api/events/:event — update details, dates or configuration (managers).
 * DELETE /api/events/:event — delete the event and everything in it (managers).
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  const viewerPromise = viewerForEvent(e, me);

  const [viewer, tracks, prizes, criteria, judges, [counts]] = await Promise.all([
    viewerPromise,
    db.select().from(track).where(eq(track.eventId, e.id)).orderBy(asc(track.position)),
    db
      .select()
      .from(prize)
      .where(eq(prize.eventId, e.id))
      .orderBy(asc(prize.kind), asc(prize.rank)),
    db
      .select()
      .from(rubricCriterion)
      .where(eq(rubricCriterion.eventId, e.id))
      .orderBy(asc(rubricCriterion.position)),
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        username: userTable.username,
        image: userTable.image,
        headline: userTable.headline,
      })
      .from(eventJudge)
      .innerJoin(userTable, eq(userTable.id, eventJudge.userId))
      .where(eq(eventJudge.eventId, e.id))
      .orderBy(asc(userTable.name)),
    db
      .select({
        projects: sql<number>`(select count(*)::int from ${project} where ${project.eventId} = ${e.id} and ${project.status} = 'submitted')`,
        participants: sql<number>`(select count(*)::int from ${registration} where ${registration.eventId} = ${e.id})`,
        teams: sql<number>`(select count(*)::int from ${team} where ${team.eventId} = ${e.id})`,
      })
      .from(event)
      .where(eq(event.id, e.id)),
  ]);
  const announcements = await announcementsForEvent(e.id, viewer, 5);

  return { event: e, tracks, prizes, criteria, judges, announcements, counts, viewer };
});

export const PATCH = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const b = await readBody(req, eventPatch);
  if (INTERNAL_INNOLAB_ONLY && b.workflow && b.workflow !== "innolab") {
    throw badRequest("Cette plateforme accepte uniquement les événements Innovation Lab");
  }
  if (INTERNAL_INNOLAB_ONLY && b.maxTeamSize !== undefined && b.maxTeamSize !== 6) {
    throw badRequest("Un projet Innovation Lab accepte au maximum 6 participants");
  }
  const scheduleIssue = innolabScheduleIssue({ ...e, ...b });
  if (scheduleIssue) throw badRequest(scheduleIssue);

  if (b.slug && b.slug !== e.slug) {
    const [taken] = await db
      .select({ id: event.id })
      .from(event)
      .where(eq(event.slug, b.slug))
      .limit(1);
    if (taken) throw conflict("That URL is already taken — choose another slug");
  }

  const {
    submissionsOpen,
    submissionsClose,
    judgingClose,
    votingOpen,
    votingClose,
    votingElectorateLockAt,
    pitchSubmissionsOpen,
    pitchSubmissionsClose,
    pitchVotingOpen,
    pitchVotingClose,
    ...rest
  } = b;
  await db
    .update(event)
    .set({
      ...rest,
      ...(b.content !== undefined && { description: docToText(b.content, 500) || e.tagline }),
      ...(submissionsOpen !== undefined && { submissionsOpen: toDate(submissionsOpen) }),
      ...(submissionsClose !== undefined && { submissionsClose: new Date(submissionsClose) }),
      ...(judgingClose !== undefined && { judgingClose: toDate(judgingClose) }),
      ...(votingOpen !== undefined && { votingOpen: toDate(votingOpen) }),
      ...(votingClose !== undefined && { votingClose: toDate(votingClose) }),
      ...(votingElectorateLockAt !== undefined && {
        votingElectorateLockAt: toDate(votingElectorateLockAt),
      }),
      ...(pitchSubmissionsOpen !== undefined && {
        pitchSubmissionsOpen: toDate(pitchSubmissionsOpen),
      }),
      ...(pitchSubmissionsClose !== undefined && {
        pitchSubmissionsClose: toDate(pitchSubmissionsClose),
      }),
      ...(pitchVotingOpen !== undefined && { pitchVotingOpen: toDate(pitchVotingOpen) }),
      ...(pitchVotingClose !== undefined && { pitchVotingClose: toDate(pitchVotingClose) }),
      updatedAt: new Date(),
    })
    .where(eq(event.id, e.id));

  await audit({
    eventId: e.id,
    actor: me,
    action: "event.updated",
    target: e.id,
    detail: { fields: Object.keys(b) },
    req,
  });
  dispatch("event.updated", { fields: Object.keys(b) }, e.id);
  const [updated] = await db.select().from(event).where(eq(event.id, e.id));
  return { event: updated };
});

export const DELETE = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  await db.delete(event).where(eq(event.id, e.id));
  await audit({ actor: me, action: "event.deleted", target: e.id, detail: { name: e.name }, req });
  return { ok: true };
});
