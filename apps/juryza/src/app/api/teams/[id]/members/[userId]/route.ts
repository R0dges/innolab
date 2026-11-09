import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, team, teamMember } from "@/lib/db";
import { innolabRosterChangesRequireCoach } from "@/lib/innolab";
import { submissionsAreOpen } from "@/lib/phase";
import { audit } from "@/lib/server/audit";
import { canManage, findEvent, isPanelJudge } from "@/lib/server/events";
import { badRequest, forbidden, handle, notFound } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

/**
 * DELETE /api/teams/:id/members/:userId — leave the team (yourself) or remove
 * a member (owner). In an Innolab event, the initial project owner remains
 * responsible for the whole event and cannot leave or be removed. Legacy
 * workflows keep their historical ownership-transfer behaviour.
 */
export const DELETE = handle<{ id: string; userId: string }>(
  async (req, { id: teamId, userId }) => {
    const me = await requireUser(req);
    const [t] = await db.select().from(team).where(eq(team.id, teamId)).limit(1);
    if (!t) throw notFound("Team not found");
    const e = await findEvent(t.eventId);
    if (!e) throw notFound("Team not found");

    const members = await db
      .select()
      .from(teamMember)
      .where(eq(teamMember.teamId, teamId))
      .orderBy(asc(teamMember.joinedAt));
    const mine = members.find((m) => m.userId === me.userId);
    const target = members.find((m) => m.userId === userId);
    if (!target) throw notFound("That person is not on this team");

    const coach = (await isPanelJudge(e.id, me.userId)) || canManage(me, e);
    const afterCutoff = innolabRosterChangesRequireCoach(e);
    const body = z
      .object({ reason: z.string().trim().min(3).max(500).optional() })
      .parse(await req.json().catch(() => ({})));
    const self = userId === me.userId;
    if (e.workflow === "innolab" && afterCutoff && !coach) {
      throw forbidden("Après mardi 23h59, un changement de groupe doit passer par un coach");
    }
    if (e.workflow === "innolab" && afterCutoff && !body.reason) {
      throw badRequest("Le motif du changement est obligatoire après mardi 23h59");
    }
    if (!self && mine?.role !== "owner" && !coach)
      throw forbidden("Only the team owner can remove members");
    if (!coach && !submissionsAreOpen(e))
      throw forbidden("Team rosters are locked after the deadline");

    const remaining = members.filter((m) => m.userId !== userId);
    if (remaining.length === 0) {
      if (!self && !coach) throw badRequest("Cannot remove the last member");
      await db.delete(team).where(eq(team.id, teamId));
      await audit({ eventId: e.id, actor: me, action: "team.disbanded", target: teamId, req });
      return { ok: true, disbanded: true };
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(teamMember)
        .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
      const successor = remaining[0];
      if (target.role === "owner" && successor) {
        await tx
          .update(teamMember)
          .set({ role: "owner" })
          .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, successor.userId)));
      }
    });
    await audit({
      eventId: e.id,
      actor: me,
      action: self ? "team.left" : "team.member_removed",
      target: teamId,
      detail: { userId, reason: body.reason ?? null, afterCutoff },
      req,
    });
    return { ok: true, disbanded: false };
  }
);
