import { and, asc, eq, sql } from "drizzle-orm";

import { db, project, registration, team, teamMember, user as userTable } from "@/lib/db";
import { submissionsAreOpen } from "@/lib/phase";
import { findEvent } from "@/lib/server/events";
import { conflict, forbidden, notFound } from "@/lib/server/http";

/** Team read helpers shared by the team routes and server-rendered pages. */

export async function teamMembers(teamId: string) {
  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
      headline: userTable.headline,
      role: teamMember.role,
      joinedAt: teamMember.joinedAt,
    })
    .from(teamMember)
    .innerJoin(userTable, eq(userTable.id, teamMember.userId))
    .where(eq(teamMember.teamId, teamId))
    .orderBy(asc(teamMember.joinedAt));
}

export async function memberCount(teamId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamMember)
    .where(eq(teamMember.teamId, teamId));
  return row?.n ?? 0;
}

export async function teamProject(teamId: string) {
  const [p] = await db
    .select({ id: project.id, title: project.title, status: project.status })
    .from(project)
    .where(eq(project.teamId, teamId))
    .limit(1);
  return p ?? null;
}

export async function findTeam(teamId: string) {
  const [t] = await db.select().from(team).where(eq(team.id, teamId)).limit(1);
  return t ?? null;
}

export interface JoinTeamOptions {
  registerUser?: boolean;
  requireRegistration?: boolean;
  requireLookingForMembers?: boolean;
}

/**
 * Add one person to a team while serializing every membership change for both
 * the person and the target team. The locks make the event-level one-team rule
 * and the capacity check safe under concurrent requests.
 */
export async function joinTeam(teamId: string, userId: string, options: JoinTeamOptions = {}) {
  const initialTeam = await findTeam(teamId);
  if (!initialTeam) throw notFound("Team not found");
  const event = await findEvent(initialTeam.eventId);
  if (!event) throw notFound("Team not found");

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`team-membership:${event.id}:${userId}`}))`
    );
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`team-capacity:${teamId}`}))`);

    const [target] = await tx.select().from(team).where(eq(team.id, teamId)).limit(1);
    if (!target || target.eventId !== event.id) throw notFound("Team not found");

    const [current] = await tx
      .select({ id: team.id, name: team.name })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(and(eq(team.eventId, event.id), eq(teamMember.userId, userId)))
      .limit(1);
    if (current?.id === target.id) {
      if (options.registerUser) {
        await tx.insert(registration).values({ eventId: event.id, userId }).onConflictDoNothing();
      }
      return { team: target, event, alreadyMember: true };
    }
    if (current) {
      throw conflict(`You are already on "${current.name}" for this event; leave it first`);
    }
    if (!submissionsAreOpen(event)) throw forbidden("Team formation is closed for this event");
    if (options.requireLookingForMembers && !target.lookingForMembers) {
      throw forbidden("This project is not accepting new members");
    }
    if (options.requireRegistration) {
      const [registered] = await tx
        .select({ userId: registration.userId })
        .from(registration)
        .where(and(eq(registration.eventId, event.id), eq(registration.userId, userId)))
        .limit(1);
      if (!registered) throw forbidden("Register for this event before joining a project");
    }

    const [count] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(teamMember)
      .where(eq(teamMember.teamId, target.id));
    if ((count?.value ?? 0) >= event.maxTeamSize) throw conflict("This team is full");

    await tx.insert(teamMember).values({ teamId: target.id, userId, role: "member" });
    if (options.registerUser) {
      await tx.insert(registration).values({ eventId: event.id, userId }).onConflictDoNothing();
    }
    return { team: target, event, alreadyMember: false };
  });
}

export const inviteUrl = (origin: string, token: string) => `${origin}/join/${token}`;
