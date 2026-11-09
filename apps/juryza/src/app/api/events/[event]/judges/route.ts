import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { assignment, db, eventJudge, judgeInvite, score, user as userTable } from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { audit } from "@/lib/server/audit";
import { canManageJudgePanel, loadCoachedEvent } from "@/lib/server/events";
import { badRequest, created, handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET  /api/events/:event/judges — the judging panel with each judge's tracks
 *      and progress (assigned vs scored), plus pending invitations (coaches).
 * POST /api/events/:event/judges { email, trackIds } — invite a judge. An
 *      existing account joins the panel immediately; otherwise an invitation
 *      link is created (Juryza runs offline, so the organizer shares the link).
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadCoachedEvent(ref, me);
  const canRemove = canManageJudgePanel(me, e);
  const [panel, invites] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        username: userTable.username,
        image: userTable.image,
        trackIds: eventJudge.trackIds,
        joinedAt: eventJudge.createdAt,
        assigned: sql<number>`(select count(*)::int from ${assignment} where ${assignment.eventId} = ${e.id} and ${assignment.judgeId} = ${userTable.id})`,
        scored: sql<number>`(select count(*)::int from ${score} where ${score.eventId} = ${e.id} and ${score.judgeId} = ${userTable.id})`,
        lastScoredAt: sql<Date | null>`(select max(${score.updatedAt}) from ${score} where ${score.eventId} = ${e.id} and ${score.judgeId} = ${userTable.id})`,
      })
      .from(eventJudge)
      .innerJoin(userTable, eq(userTable.id, eventJudge.userId))
      .where(eq(eventJudge.eventId, e.id))
      .orderBy(asc(userTable.name)),
    db
      .select()
      .from(judgeInvite)
      .where(and(eq(judgeInvite.eventId, e.id), isNull(judgeInvite.acceptedAt)))
      .orderBy(asc(judgeInvite.createdAt)),
  ]);
  const origin = new URL(req.url).origin;
  return {
    canInvite: true,
    canRemove,
    judges: panel.map((judge) => ({
      ...judge,
      trackIds: EVENT_TRACKS_ENABLED ? judge.trackIds : [],
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      trackIds: EVENT_TRACKS_ENABLED ? i.trackIds : [],
      createdAt: i.createdAt,
      inviteUrl: `${origin}/invite/${i.token}`,
    })),
  };
});

const body = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  trackIds: z.array(z.string()).max(30).default([]),
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadCoachedEvent(ref, me);
  const { email, trackIds } = await readBody(req, body);
  if (!EVENT_TRACKS_ENABLED && trackIds.length > 0) {
    throw badRequest("Les restrictions de jury par axe sont désactivées");
  }
  const effectiveTrackIds = EVENT_TRACKS_ENABLED ? trackIds : [];

  const [existing] = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);
  if (existing) {
    await db
      .insert(eventJudge)
      .values({ eventId: e.id, userId: existing.id, trackIds: effectiveTrackIds })
      .onConflictDoUpdate({
        target: [eventJudge.eventId, eventJudge.userId],
        set: { trackIds: effectiveTrackIds },
      });
    if (existing.role === "participant") {
      await db.update(userTable).set({ role: "judge" }).where(eq(userTable.id, existing.id));
    }
    await audit({
      eventId: e.id,
      actor: me,
      action: "judge.added",
      target: existing.id,
      detail: { email },
      req,
    });
    dispatch("judge.joined", { userId: existing.id }, e.id);
    return created({ status: "added", userId: existing.id, name: existing.name });
  }

  const token = secretToken(24);
  await db.insert(judgeInvite).values({
    id: id.invite(),
    eventId: e.id,
    email,
    token,
    trackIds: effectiveTrackIds,
    invitedBy: me.userId,
  });
  await audit({ eventId: e.id, actor: me, action: "judge.invited", detail: { email }, req });
  dispatch("judge.invited", { email }, e.id);
  return created({ status: "invited", inviteUrl: `${new URL(req.url).origin}/invite/${token}` });
});
