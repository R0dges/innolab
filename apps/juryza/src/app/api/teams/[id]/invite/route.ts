import { and, eq } from "drizzle-orm";

import { db, team, teamMember } from "@/lib/db";
import { secretToken } from "@/lib/ids";
import { audit } from "@/lib/server/audit";
import { findEvent } from "@/lib/server/events";
import { forbidden, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { inviteUrl } from "@/lib/server/teams";

/**
 * POST /api/teams/:id/invite — reset the invite link (owner). The old link
 * stops working immediately; use it when a link leaked.
 */
export const POST = handle<{ id: string }>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const [m] = await db
    .select({ role: teamMember.role, eventId: team.eventId })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, me.userId)))
    .limit(1);
  if (m?.role !== "owner") throw forbidden("Only the team owner can reset the invite link");
  const event = await findEvent(m.eventId);
  if (!event || event.workflow === "innolab") {
    throw forbidden("Innolab project membership uses approved join requests, not invite links");
  }

  const token = secretToken(24);
  await db.update(team).set({ inviteToken: token }).where(eq(team.id, teamId));
  await audit({ eventId: m.eventId, actor: me, action: "team.invite_reset", target: teamId, req });
  return { inviteUrl: inviteUrl(new URL(req.url).origin, token) };
});
