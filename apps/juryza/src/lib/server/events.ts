import { and, eq, ne, or, sql } from "drizzle-orm";

import type { Event } from "@/lib/db";
import { db, event, eventJudge, registration, team, teamMember } from "@/lib/db";
import { hasAtLeast } from "@/lib/roles";
import { conflict, forbidden, notFound } from "@/lib/server/http";
import type { Identity } from "@/lib/server/identity";

/**
 * Event lookup and the per-event permission rules.
 *
 *  - **Manage** an event: every attached coach, or a global admin.
 *  - **Judge** an event: a member of its judging panel (`event_judge`).
 *  - **See** a draft event: managers only; published events are public.
 */

/** Find an event by id or slug. */
export async function findEvent(ref: string): Promise<Event | null> {
  const [row] = await db
    .select()
    .from(event)
    .where(or(eq(event.id, ref), eq(event.slug, ref)))
    .limit(1);
  return row ?? null;
}

export function canManage(me: Identity | null, e: Pick<Event, "createdBy">): boolean {
  if (!me) return false;
  return me.role === "admin" || (hasAtLeast(me.role, "judge") && e.createdBy === me.userId);
}

/** Removing Innolab jury members remains an admin-only operation. */
export function canManageJudgePanel(
  me: Identity | null,
  e: Pick<Event, "createdBy" | "workflow">
): boolean {
  return canManage(me, e) && (e.workflow !== "innolab" || me?.role === "admin");
}

/** Load an event the caller may see; drafts are limited to managers and appointed judges. */
export async function loadEvent(ref: string, me: Identity | null): Promise<Event> {
  const e = await findEvent(ref);
  if (!e) throw notFound("Event not found");
  if (e.visibility !== "published" && !canManage(me, e)) {
    if (!me || !(await isPanelJudge(e.id, me.userId))) throw notFound("Event not found");
  }
  return e;
}

export async function loadManagedEvent(ref: string, me: Identity): Promise<Event> {
  const e = await findEvent(ref);
  if (!e) throw notFound("Event not found");
  if (!canManage(me, e) && !(await isPanelJudge(e.id, me.userId))) {
    throw forbidden("Only coaches attached to this event can do that");
  }
  return e;
}

/** Operational Innolab actions may be performed by a manager or an appointed coach. */
export async function loadCoachedEvent(ref: string, me: Identity): Promise<Event> {
  const e = await findEvent(ref);
  if (!e) throw notFound("Event not found");
  if (!canManage(me, e) && !(await isPanelJudge(e.id, me.userId))) {
    throw forbidden("Only this event's coaches can do that");
  }
  return e;
}

export async function loadJudgeManagedEvent(ref: string, me: Identity): Promise<Event> {
  const e = await loadManagedEvent(ref, me);
  if (e.workflow === "innolab" && me.role !== "admin") {
    throw forbidden("Only platform admins can remove judges from an Innolab event");
  }
  return e;
}

export async function isPanelJudge(eventId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: eventJudge.userId })
    .from(eventJudge)
    .where(and(eq(eventJudge.eventId, eventId), eq(eventJudge.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** All event-level business permissions are shared by attached coaches. */
export const isEventCoach = isPanelJudge;

/** The caller's team in an event, if any. A user is on at most one team per event. */
export async function teamOf(eventId: string, userId: string) {
  const [row] = await db
    .select({ id: team.id, name: team.name, role: teamMember.role })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(team.eventId, eventId), eq(teamMember.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** The caller's complete relationship to an event, shared by event read models. */
export async function viewerForEvent(e: Event, me: Identity | null) {
  if (!me) return null;
  const [[reg], teamRow, panelJudge] = await Promise.all([
    db
      .select({ userId: registration.userId })
      .from(registration)
      .where(and(eq(registration.eventId, e.id), eq(registration.userId, me.userId)))
      .limit(1),
    teamOf(e.id, me.userId),
    isPanelJudge(e.id, me.userId),
  ]);
  return {
    registered: Boolean(reg),
    team: teamRow,
    isJudge: panelJudge,
    canManage: canManage(me, e) || panelJudge,
  };
}

export type EventViewer = Awaited<ReturnType<typeof viewerForEvent>>;

export async function register(eventId: string, userId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`active-participation:${userId}`}))`
    );
    const [target] = await tx
      .select({
        workflow: event.workflow,
        activatedAt: event.activatedAt,
        cancelledAt: event.cancelledAt,
        archivedAt: event.archivedAt,
      })
      .from(event)
      .where(eq(event.id, eventId))
      .limit(1);
    const isActiveInnolab =
      target?.workflow === "innolab" &&
      Boolean(target.activatedAt) &&
      !target.cancelledAt &&
      !target.archivedAt;

    if (isActiveInnolab) {
      const [existing] = await tx
        .select({ name: event.name })
        .from(registration)
        .innerJoin(event, eq(event.id, registration.eventId))
        .where(
          and(
            eq(registration.userId, userId),
            ne(event.id, eventId),
            eq(event.workflow, "innolab"),
            eq(event.visibility, "published"),
            sql`${event.activatedAt} is not null`,
            sql`${event.cancelledAt} is null`,
            sql`${event.archivedAt} is null`
          )
        )
        .limit(1);
      if (existing) {
        throw conflict(`Vous participez déjà à l’Innovation Lab actif « ${existing.name} ».`);
      }
    }

    await tx.insert(registration).values({ eventId, userId }).onConflictDoNothing();
  });
}
