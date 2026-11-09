import { eq } from "drizzle-orm";

import { db, event, eventJudge, judgeInvite, user as userTable } from "@/lib/db";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { hasAtLeast } from "@/lib/roles";
import { audit } from "@/lib/server/audit";
import { isPanelJudge } from "@/lib/server/events";
import { forbidden, handle, notFound } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { dispatch } from "@/lib/server/webhooks";

type P = { token: string };

/**
 * GET  /api/invites/:token — preview a judging invitation.
 * POST /api/invites/:token — accept it: the signed-in account joins the
 *      event's judging panel (and gains the judge role). The invitation is
 *      bound to the invited email address — a forwarded link does not work for
 *      someone else's account.
 */

async function load(token: string) {
  const [row] = await db
    .select({ invite: judgeInvite, event })
    .from(judgeInvite)
    .innerJoin(event, eq(event.id, judgeInvite.eventId))
    .where(eq(judgeInvite.token, token))
    .limit(1);
  if (!row) throw notFound("This invitation is invalid or was revoked");
  return row;
}

export const GET = handle<P>(async (_req, { token }) => {
  const { invite, event: e } = await load(token);
  return {
    email: invite.email,
    accepted: Boolean(invite.acceptedAt),
    event: { slug: e.slug, name: e.name, tagline: e.tagline, hue: e.hue },
  };
});

export const POST = handle<P>(async (req, { token }) => {
  const me = await requireUser(req);
  const { invite, event: e } = await load(token);
  if (invite.acceptedAt && invite.acceptedBy !== me.userId)
    throw forbidden("This invitation was already used");
  if (invite.email.toLowerCase() !== me.email.toLowerCase()) {
    throw forbidden(
      `This invitation is for ${invite.email}. Sign in with that address to accept it.`
    );
  }
  if (e.workflow === "innolab") {
    const [inviter] = invite.invitedBy
      ? await db
          .select({ id: userTable.id, role: userTable.role })
          .from(userTable)
          .where(eq(userTable.id, invite.invitedBy))
          .limit(1)
      : [];
    const authorized =
      inviter !== undefined &&
      (inviter.role === "admin" ||
        (inviter.id === e.createdBy && hasAtLeast(inviter.role, "judge")) ||
        (await isPanelJudge(e.id, inviter.id)));
    if (!authorized) {
      throw forbidden("This Innolab judging invitation is no longer authorized");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(eventJudge)
      .values({
        eventId: e.id,
        userId: me.userId,
        trackIds: EVENT_TRACKS_ENABLED ? invite.trackIds : [],
      })
      .onConflictDoNothing();
    await tx
      .update(judgeInvite)
      .set({ acceptedAt: new Date(), acceptedBy: me.userId })
      .where(eq(judgeInvite.id, invite.id));
    if (me.role === "participant")
      await tx.update(userTable).set({ role: "judge" }).where(eq(userTable.id, me.userId));
  });
  await audit({ eventId: e.id, actor: me, action: "judge.joined", target: me.userId, req });
  dispatch("judge.joined", { userId: me.userId }, e.id);
  return { eventSlug: e.slug };
});
