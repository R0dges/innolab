import { and, eq, notExists } from "drizzle-orm";
import { z } from "zod";

import { assignment, db, eventJudge, judgeInvite, score } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { loadJudgeManagedEvent } from "@/lib/server/events";
import { handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";

type P = { event: string; userId: string };

/**
 * PATCH  /api/events/:event/judges/:userId { trackIds } — change which tracks
 *        a judge covers (empty = all tracks).
 * DELETE /api/events/:event/judges/:userId — remove a judge from the panel.
 *        Their unscored assignments are released; scores they already gave are
 *        kept (they are part of the record). Passing an invitation id instead
 *        of a user id revokes that pending invitation.
 */

export const PATCH = handle<P>(async (req, { event: ref, userId }) => {
  const me = await requireUser(req);
  const e = await loadJudgeManagedEvent(ref, me);
  if (!EVENT_TRACKS_ENABLED) throw notFound("Les restrictions par axe sont désactivées");
  const { trackIds } = await readBody(req, z.object({ trackIds: z.array(z.string()).max(30) }));
  const res = await db
    .update(eventJudge)
    .set({ trackIds })
    .where(and(eq(eventJudge.eventId, e.id), eq(eventJudge.userId, userId)));
  if (!res.rowCount) throw notFound("That judge is not on this panel");
  await audit({
    eventId: e.id,
    actor: me,
    action: "judge.tracks_updated",
    target: userId,
    detail: { trackIds },
    req,
  });
  return { ok: true };
});

export const DELETE = handle<P>(async (req, { event: ref, userId }) => {
  const me = await requireUser(req);
  const e = await loadJudgeManagedEvent(ref, me);

  if (userId.startsWith("inv_")) {
    await db
      .delete(judgeInvite)
      .where(and(eq(judgeInvite.eventId, e.id), eq(judgeInvite.id, userId)));
    await audit({ eventId: e.id, actor: me, action: "judge.invite_revoked", target: userId, req });
    return { ok: true };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(eventJudge)
      .where(and(eq(eventJudge.eventId, e.id), eq(eventJudge.userId, userId)));
    await tx.delete(assignment).where(
      and(
        eq(assignment.eventId, e.id),
        eq(assignment.judgeId, userId),
        notExists(
          tx
            .select({ id: score.id })
            .from(score)
            .where(
              and(eq(score.judgeId, assignment.judgeId), eq(score.projectId, assignment.projectId))
            )
        )
      )
    );
  });
  await audit({ eventId: e.id, actor: me, action: "judge.removed", target: userId, req });
  return { ok: true };
});
