import type { NextRequest } from "next/server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import {
  db,
  event,
  eventDocument,
  eventJudge,
  eventResource,
  project,
  registration,
  rubricCriterion,
  track,
  user as userTable,
} from "@/lib/db";
import { DEFAULT_EVENT_LOCATION } from "@/lib/event-options";
import { id } from "@/lib/ids";
import { EVENT_TRACKS_ENABLED, INTERNAL_INNOLAB_ONLY } from "@/lib/platform";
import { docToText } from "@/lib/rich-text";
import { DEFAULT_RUBRIC } from "@/lib/rubric";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict, created, handle, readBody } from "@/lib/server/http";
import { requireRole, resolveIdentity } from "@/lib/server/identity";
import { eventInput } from "@/lib/server/schemas";
import { innolabScheduleIssue, judgingScheduleIssue, toDate } from "@/lib/server/validation";
import { dispatch } from "@/lib/server/webhooks";

/**
 * GET  /api/events — published events (plus the caller's own drafts), newest
 *      first, with project and participant counts.
 * POST /api/events — create an event (coach). Starts as a draft unless
 *      `visibility: "published"`; ships with a sensible default rubric.
 */

export const GET = handle(async (req: NextRequest) => {
  const me = await resolveIdentity(req);
  const accessFilter =
    me?.role === "admin"
      ? undefined
      : me
        ? or(eq(event.visibility, "published"), eq(event.createdBy, me.userId))
        : eq(event.visibility, "published");
  const visible = INTERNAL_INNOLAB_ONLY
    ? accessFilter
      ? and(eq(event.workflow, "innolab"), accessFilter)
      : eq(event.workflow, "innolab")
    : accessFilter;

  const rows = await db
    .select()
    .from(event)
    .where(visible)
    .orderBy(desc(event.isFixture), desc(event.submissionsClose));
  const ids = rows.map((r) => r.id);
  const [projectCounts, participantCounts] = ids.length
    ? await Promise.all([
        db
          .select({ eventId: project.eventId, n: sql<number>`count(*)::int` })
          .from(project)
          .where(and(inArray(project.eventId, ids), eq(project.status, "submitted")))
          .groupBy(project.eventId),
        db
          .select({ eventId: registration.eventId, n: sql<number>`count(*)::int` })
          .from(registration)
          .where(inArray(registration.eventId, ids))
          .groupBy(registration.eventId),
      ])
    : [[], []];
  const pc = new Map(projectCounts.map((r) => [r.eventId, r.n]));
  const rc = new Map(participantCounts.map((r) => [r.eventId, r.n]));
  return {
    events: rows.map((e) => ({
      ...e,
      projectCount: pc.get(e.id) ?? 0,
      participantCount: rc.get(e.id) ?? 0,
    })),
  };
});

export const POST = handle(async (req: NextRequest) => {
  const me = await requireRole(req, "judge");
  const b = await readBody(req, eventInput);
  if (INTERNAL_INNOLAB_ONLY && b.workflow !== "innolab") {
    throw badRequest("Cette plateforme accepte uniquement les événements Innovation Lab");
  }
  if (!EVENT_TRACKS_ENABLED && b.tracks.length > 0) {
    throw badRequest("Les axes sont désactivés pour les événements Innovation Lab");
  }
  const scheduleIssue = innolabScheduleIssue(b);
  if (scheduleIssue) throw badRequest(scheduleIssue);
  const judgingIssue = judgingScheduleIssue(b);
  if (judgingIssue) throw badRequest(judgingIssue);

  const [taken] = await db
    .select({ id: event.id })
    .from(event)
    .where(eq(event.slug, b.slug))
    .limit(1);
  if (taken) throw conflict("That URL is already taken — choose another slug");

  const eventId = id.event();
  const eventLocation = b.location || me.location || DEFAULT_EVENT_LOCATION;
  await db.transaction(async (tx) => {
    if (b.visibility === "published") {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`active-event:${eventLocation}`}))`
      );
      const [active] = await tx
        .select({ name: event.name, creator: userTable.name })
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
      if (active) {
        throw conflict(
          `Un événement est déjà actif à ${eventLocation} : "${active.name}", créé par ${active.creator ?? "un coach"}.`
        );
      }
    }
    await tx.insert(event).values({
      id: eventId,
      slug: b.slug,
      name: b.name,
      tagline: b.tagline ?? null,
      description: docToText(b.content, 500) || b.tagline || null,
      content: b.content ?? null,
      rules: b.rules ?? null,
      mode: b.mode,
      location: eventLocation,
      hue: b.hue,
      visibility: b.visibility,
      workflow: "innolab",
      pitchSubmissionsOpen: toDate(b.pitchSubmissionsOpen),
      pitchSubmissionsClose: toDate(b.pitchSubmissionsClose),
      pitchVotingOpen: toDate(b.pitchVotingOpen),
      pitchVotingClose: toDate(b.pitchVotingClose),
      submissionsOpen: toDate(b.submissionsOpen),
      submissionsClose: new Date(b.submissionsClose),
      judgingOpen: toDate(b.judgingOpen),
      judgingClose: toDate(b.judgingClose),
      votingOpen: toDate(b.votingOpen),
      votingClose: toDate(b.votingClose),
      maxTeamSize: INTERNAL_INNOLAB_ONLY ? 6 : b.maxTeamSize,
      reviewsPerProject: b.reviewsPerProject,
      votingAccess: b.votingAccess,
      votingEmailDomains: b.votingEmailDomains,
      voteBudget: b.voteBudget,
      votingMode: b.votingMode,
      votingShortlistSize: b.votingShortlistSize,
      votingElectorateLockAt: toDate(b.votingElectorateLockAt),
      createdBy: me.userId,
      activatedAt: b.visibility === "published" ? new Date() : null,
    });
    if (b.visibility === "published") {
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
          .values(participants.map((account) => ({ eventId, userId: account.id })))
          .onConflictDoNothing();
      }
      if (coaches.length) {
        await tx
          .insert(eventJudge)
          .values(coaches.map((account) => ({ eventId, userId: account.id })))
          .onConflictDoNothing();
      }
    }
    if (EVENT_TRACKS_ENABLED && b.tracks.length) {
      await tx
        .insert(track)
        .values(b.tracks.map((name, position) => ({ id: id.track(), eventId, name, position })));
    }
    await tx.insert(rubricCriterion).values(
      DEFAULT_RUBRIC.map((criterion, position) => ({
        ...criterion,
        id: id.criterion(),
        eventId,
        position,
      }))
    );
    if (b.auditDocument) {
      await tx.insert(eventDocument).values({
        id: id.eventDocument(),
        eventId,
        kind: "audit",
        title: b.auditDocument.title,
        url: b.auditDocument.url,
        summary: b.auditDocument.summary ?? null,
        findings: b.auditDocument.findings,
        problems: b.auditDocument.problems,
        version: 1,
        isCurrent: true,
        createdBy: me.userId,
      });
    }
    if (b.resources.length) {
      await tx.insert(eventResource).values(
        b.resources.map((resource, position) => ({
          id: id.eventResource(),
          eventId,
          kind: resource.kind,
          name: resource.name,
          category: resource.category,
          description: resource.description ?? null,
          url: resource.url ?? null,
          accessLevel: resource.accessLevel,
          availability: resource.availability,
          ownerName: resource.ownerName ?? null,
          position: resource.position || position,
          createdBy: me.userId,
        }))
      );
    }
  });

  await audit({
    eventId,
    actor: me,
    action: "event.created",
    target: eventId,
    detail: {
      auditDocument: Boolean(b.auditDocument),
      resources: b.resources.length,
    },
    req,
  });
  dispatch("event.created", { name: b.name, slug: b.slug }, eventId);
  return created({ id: eventId, slug: b.slug });
});
