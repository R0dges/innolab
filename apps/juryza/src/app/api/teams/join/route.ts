import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, team } from "@/lib/db";
import { isInnolab } from "@/lib/innolab";
import { submissionsAreOpen } from "@/lib/phase";
import { audit } from "@/lib/server/audit";
import { findEvent } from "@/lib/server/events";
import { handle, notFound, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { joinTeam, teamMembers } from "@/lib/server/teams";
import { dispatch } from "@/lib/server/webhooks";

/**
 * GET  /api/teams/join?token=… — preview the team behind an invite link.
 * POST /api/teams/join { token } — join it. The link is the capability: no
 *      accept/decline round-trip. Joining is idempotent, respects the event's
 *      max team size, and is closed after the submission deadline.
 */

async function byToken(token: string) {
  const [t] = await db.select().from(team).where(eq(team.inviteToken, token)).limit(1);
  if (!t) throw notFound("This invite link is invalid or has been reset");
  const e = await findEvent(t.eventId);
  if (!e) throw notFound("This invite link is invalid or has been reset");
  if (isInnolab(e)) {
    throw notFound("Innolab project membership requires an approved join request");
  }
  return { t, e };
}

export const GET = handle(async (req: NextRequest) => {
  await resolveIdentity(req);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const { t, e } = await byToken(token);
  const members = await teamMembers(t.id);
  return {
    team: { id: t.id, name: t.name, description: t.description },
    event: { id: e.id, slug: e.slug, name: e.name, maxTeamSize: e.maxTeamSize, hue: e.hue },
    members: members.map(({ name, username, image, role }) => ({ name, username, image, role })),
    open: submissionsAreOpen(e),
    full: members.length >= e.maxTeamSize,
  };
});

export const POST = handle(async (req: NextRequest) => {
  const me = await requireUser(req);
  const { token } = await readBody(req, z.object({ token: z.string().min(1) }));
  const { t, e } = await byToken(token);
  const joined = await joinTeam(t.id, me.userId, { registerUser: true });

  if (joined.alreadyMember) {
    return { teamId: t.id, eventSlug: e.slug, alreadyMember: true };
  }

  await audit({ eventId: e.id, actor: me, action: "team.joined", target: t.id, req });
  dispatch("team.joined", { teamId: t.id, userId: me.userId }, e.id);
  return { teamId: t.id, eventSlug: e.slug, alreadyMember: false };
});
