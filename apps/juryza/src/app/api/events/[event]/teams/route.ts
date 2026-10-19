import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, project, team, teamMember, user as userTable } from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { isInnolab } from "@/lib/innolab";
import { submissionsAreOpen } from "@/lib/phase";
import { audit } from "@/lib/server/audit";
import { loadEvent, register, teamOf } from "@/lib/server/events";
import { conflict, created, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { inviteUrl } from "@/lib/server/teams";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET  /api/events/:event/teams — every team with its members, so people can
 *      find a team that is looking for members. Invite links are not included.
 * POST /api/events/:event/teams — create a team; the caller becomes its owner
 *      and is registered for the event. One team per person per event, and only
 *      while submissions are open.
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const e = await loadEvent(ref, await resolveIdentity(req));
  const [teams, members] = await Promise.all([
    db
      .select({
        id: team.id,
        name: team.name,
        description: team.description,
        lookingForMembers: team.lookingForMembers,
        createdAt: team.createdAt,
        projectId: sql<
          string | null
        >`(select ${project.id} from ${project} where ${project.teamId} = ${team.id} and ${project.status} = 'submitted' limit 1)`,
      })
      .from(team)
      .where(eq(team.eventId, e.id))
      .orderBy(asc(team.name)),
    db
      .select({
        teamId: teamMember.teamId,
        id: userTable.id,
        name: userTable.name,
        username: userTable.username,
        image: userTable.image,
        role: teamMember.role,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(userTable, eq(userTable.id, teamMember.userId))
      .where(eq(team.eventId, e.id)),
  ]);
  const byTeam = new Map<string, typeof members>();
  for (const m of members) byTeam.set(m.teamId, [...(byTeam.get(m.teamId) ?? []), m]);
  return {
    maxTeamSize: e.maxTeamSize,
    teams: teams.map((t) => ({ ...t, members: byTeam.get(t.id) ?? [] })),
  };
});

const body = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).nullish(),
  lookingForMembers: z.boolean().default(false),
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  if (isInnolab(e)) {
    throw forbidden("Innolab teams are created from a selected pitch");
  }
  if (!submissionsAreOpen(e)) throw forbidden("Team formation is closed for this event");
  if (await teamOf(e.id, me.userId)) throw conflict("You are already on a team for this event");
  const b = await readBody(req, body);

  const teamId = id.team();
  const token = secretToken(24);
  await db.transaction(async (tx) => {
    await tx.insert(team).values({
      id: teamId,
      eventId: e.id,
      name: b.name,
      description: b.description ?? null,
      lookingForMembers: b.lookingForMembers,
      inviteToken: token,
    });
    await tx.insert(teamMember).values({ teamId, userId: me.userId, role: "owner" });
  });
  await register(e.id, me.userId);

  await audit({ eventId: e.id, actor: me, action: "team.created", target: teamId, req });
  dispatch("team.created", { teamId, name: b.name }, e.id);
  return created({ id: teamId, inviteUrl: inviteUrl(new URL(req.url).origin, token) });
});
