import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, team, teamMember } from "@/lib/db";
import { submissionsAreOpen } from "@/lib/phase";
import { audit } from "@/lib/server/audit";
import { canManage, findEvent, isPanelJudge } from "@/lib/server/events";
import { forbidden, handle, notFound, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { findTeam, inviteUrl, teamMembers, teamProject } from "@/lib/server/teams";

type P = { id: string };

/**
 * GET    /api/teams/:id — the team, its members and project. Members (and the
 *        event's organizers) also get the invite link.
 * PATCH  /api/teams/:id — rename / describe / toggle "looking for members" (owner).
 * DELETE /api/teams/:id — disband (owner, while submissions are open, no project).
 */

async function context(teamId: string, userId: string | null) {
  const t = await findTeam(teamId);
  if (!t) throw notFound("Team not found");
  const e = await findEvent(t.eventId);
  if (!e) throw notFound("Team not found");
  const [m] = userId
    ? await db
        .select({ role: teamMember.role })
        .from(teamMember)
        .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
        .limit(1)
    : [];
  return { t, e, role: m?.role ?? null };
}

export const GET = handle<P>(async (req, { id: teamId }) => {
  const me = await resolveIdentity(req);
  const { t, e, role } = await context(teamId, me?.userId ?? null);
  const coach = me ? await isPanelJudge(e.id, me.userId) : false;
  const manager = coach || canManage(me, e);
  const canReviewRequests = coach || manager;
  const privileged = role !== null || coach || manager;
  const [members, proj] = await Promise.all([teamMembers(t.id), teamProject(t.id)]);
  return {
    team: {
      id: t.id,
      name: t.name,
      description: t.description,
      lookingForMembers: t.lookingForMembers,
      createdAt: t.createdAt,
      inviteUrl:
        e.workflow !== "innolab" && privileged
          ? inviteUrl(new URL(req.url).origin, t.inviteToken)
          : undefined,
    },
    event: {
      id: e.id,
      slug: e.slug,
      name: e.name,
      maxTeamSize: e.maxTeamSize,
      submissionsClose: e.submissionsClose,
      workflow: e.workflow,
    },
    members,
    project: proj && (proj.status === "submitted" || privileged) ? proj : null,
    viewer: { role, canManage: manager, canReviewRequests, open: submissionsAreOpen(e) },
  };
});

const body = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).nullish(),
  lookingForMembers: z.boolean().optional(),
});

export const PATCH = handle<P>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const { t, e, role } = await context(teamId, me.userId);
  const coach = await isPanelJudge(e.id, me.userId);
  if (role !== "owner" && !coach && !canManage(me, e))
    throw forbidden("Only the project owner or an event coach can edit the project team");
  const b = await readBody(req, body);
  await db
    .update(team)
    .set({
      ...(b.name && { name: b.name }),
      ...(b.description !== undefined && { description: b.description ?? null }),
      ...(b.lookingForMembers !== undefined && { lookingForMembers: b.lookingForMembers }),
    })
    .where(eq(team.id, t.id));
  await audit({ eventId: e.id, actor: me, action: "team.updated", target: t.id, req });
  return { ok: true };
});

export const DELETE = handle<P>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const { t, e, role } = await context(teamId, me.userId);
  const manager = (await isPanelJudge(e.id, me.userId)) || canManage(me, e);
  if (role !== "owner" && !manager) throw forbidden("Only the team owner can disband the team");
  if (e.workflow === "innolab" && !manager) {
    throw forbidden("Seul un coach peut supprimer un groupe projet Innovation Lab");
  }
  if (!manager) {
    if (!submissionsAreOpen(e)) throw forbidden("Teams are locked after the deadline");
    if (await teamProject(t.id)) throw forbidden("Delete the team's project before disbanding");
  }
  await db.delete(team).where(eq(team.id, t.id));
  await audit({
    eventId: e.id,
    actor: me,
    action: "team.disbanded",
    target: t.id,
    detail: { name: t.name },
    req,
  });
  return { ok: true, eventSlug: e.slug };
});
