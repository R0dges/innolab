import { and, eq, or } from "drizzle-orm";

import type { Event } from "@/lib/db";
import { db, event, eventJudge, registration, team, teamMember } from "@/lib/db";
import { hasAtLeast } from "@/lib/roles";
import { forbidden, notFound } from "@/lib/server/http";
import type { Identity } from "@/lib/server/identity";

/**
 * Event lookup and the per-event permission rules.
 *
 *  - **Manage** an event: its coach creator, or an admin. The coach role may
 *    create events, but does not grant power over another coach's events.
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

/** Innolab jury membership is appointed by platform admins, not event participants or owners. */
export function canManageJudgePanel(
  me: Identity | null,
  e: Pick<Event, "createdBy" | "workflow">
): boolean {
  return canManage(me, e) && (e.workflow !== "innolab" || me?.role === "admin");
}

/** Load an event the caller may see; drafts 404 for non-managers (no existence leak). */
export async function loadEvent(ref: string, me: Identity | null): Promise<Event> {
  const e = await findEvent(ref);
  if (!e || (e.visibility !== "published" && !canManage(me, e))) throw notFound("Event not found");
  return e;
}

export async function loadManagedEvent(ref: string, me: Identity): Promise<Event> {
  const e = await findEvent(ref);
  if (!e) throw notFound("Event not found");
  if (!canManage(me, e)) throw forbidden("Only this event's coach creator can do that");
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
    throw forbidden("Only platform admins can appoint judges for an Innolab event");
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
    canManage: canManage(me, e),
  };
}

export type EventViewer = Awaited<ReturnType<typeof viewerForEvent>>;

export async function register(eventId: string, userId: string) {
  await db.insert(registration).values({ eventId, userId }).onConflictDoNothing();
}
