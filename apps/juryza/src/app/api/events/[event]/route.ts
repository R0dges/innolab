import { and, asc, eq, inArray, sql } from "drizzle-orm";

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
import { EVENT_REWARDS_ENABLED, EVENT_TRACKS_ENABLED, INTERNAL_INNOLAB_ONLY } from "@/lib/platform";
import { docToText } from "@/lib/rich-text";
import { announcementsForEvent } from "@/lib/server/announcements";
import { audit } from "@/lib/server/audit";
import { loadEvent, loadManagedEvent, viewerForEvent } from "@/lib/server/events";
import { badRequest, conflict, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { eventPatch } from "@/lib/server/schemas";
import { innolabScheduleIssue, judgingScheduleIssue, toDate } from "@/lib/server/validation";
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
    EVENT_TRACKS_ENABLED
      ? db.select().from(track).where(eq(track.eventId, e.id)).orderBy(asc(track.position))
      : Promise.resolve([]),
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

  const visiblePrizes = EVENT_REWARDS_ENABLED
    ? EVENT_TRACKS_ENABLED
      ? prizes
      : prizes.filter((entry) => entry.kind !== "track")
    : [];
  return {
    event: e,
    tracks,
    prizes: visiblePrizes,
    criteria,
    judges,
    announcements,
    counts,
    viewer,
  };
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
  const judgingIssue = judgingScheduleIssue({ ...e, ...b });
  if (judgingIssue) throw badRequest(judgingIssue);

  if (b.slug && b.slug !== e.slug) {
    const [taken] = await db
      .select({ id: event.id })
      .from(event)
      .where(eq(event.slug, b.slug))
      .limit(1);
    if (taken) throw conflict("That URL is already taken — choose another slug");
  }
  if (e.activatedAt && b.location !== undefined && b.location !== e.location) {
    throw conflict("Le lieu d'un événement actif ne peut pas être modifié");
  }

  const {
    submissionsOpen,
    submissionsClose,
    judgingOpen,
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
  const activating = b.visibility === "published" && !e.activatedAt;
  const eventLocation = b.location ?? e.location ?? me.location;
  if (activating && !eventLocation) {
    throw badRequest("Un lieu est obligatoire pour activer un événement Innovation Lab");
  }
  await db.transaction(async (tx) => {
    if (activating && eventLocation) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`active-event:${eventLocation}`}))`
      );
      const [active] = await tx
        .select({ id: event.id, name: event.name, creator: userTable.name })
        .from(event)
        .leftJoin(userTable, eq(userTable.id, event.createdBy))
        .where(
          and(
            eq(event.location, eventLocation),
            eq(event.visibility, "published"),
            sql`${event.activatedAt} is not null`,
            sql`${event.cancelledAt} is null`,
            sql`${event.archivedAt} is null`
          )
        )
        .limit(1);
      if (active && active.id !== e.id) {
        throw conflict(
          `Un événement est déjà actif à ${eventLocation} : "${active.name}", créé par ${active.creator ?? "un coach"}.`
        );
      }
    }

    await tx
      .update(event)
      .set({
        ...rest,
        ...(activating && { location: eventLocation, activatedAt: new Date() }),
        ...(b.content !== undefined && { description: docToText(b.content, 500) || e.tagline }),
        ...(submissionsOpen !== undefined && { submissionsOpen: toDate(submissionsOpen) }),
        ...(submissionsClose !== undefined && { submissionsClose: new Date(submissionsClose) }),
        ...(judgingOpen !== undefined && { judgingOpen: toDate(judgingOpen) }),
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

    if (activating && eventLocation) {
      const accounts = await tx
        .select({ id: userTable.id, role: userTable.role })
        .from(userTable)
        .where(
          and(
            eq(userTable.location, eventLocation),
            eq(userTable.banned, false),
            inArray(userTable.role, ["participant", "judge", "organizer"])
          )
        );
      const participants = accounts.filter((account) => account.role === "participant");
      const coaches = accounts.filter((account) => ["judge", "organizer"].includes(account.role));
      if (participants.length) {
        await tx
          .insert(registration)
          .values(participants.map((account) => ({ eventId: e.id, userId: account.id })))
          .onConflictDoNothing();
      }
      if (coaches.length) {
        await tx
          .insert(eventJudge)
          .values(coaches.map((account) => ({ eventId: e.id, userId: account.id })))
          .onConflictDoNothing();
      }
    }
  });

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
  if (me.role !== "admin") throw forbidden("Seul un administrateur peut supprimer un événement");
  const e = await loadManagedEvent(ref, me);
  await db.delete(event).where(eq(event.id, e.id));
  await audit({ actor: me, action: "event.deleted", target: e.id, detail: { name: e.name }, req });
  return { ok: true };
});
