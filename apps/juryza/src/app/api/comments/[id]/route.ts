import { eq } from "drizzle-orm";

import { comment, db, event } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { canManage, isEventCoach } from "@/lib/server/events";
import { forbidden, handle, notFound } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

/** DELETE /api/comments/:id — the author, or the event's organizers (moderation). */
export const DELETE = handle<{ id: string }>(async (req, { id: commentId }) => {
  const me = await requireUser(req);
  const [row] = await db
    .select({ comment, event })
    .from(comment)
    .innerJoin(event, eq(event.id, comment.eventId))
    .where(eq(comment.id, commentId))
    .limit(1);
  if (!row) throw notFound("Comment not found");
  const moderator = canManage(me, row.event) || (await isEventCoach(row.event.id, me.userId));
  if (row.comment.authorId !== me.userId && !moderator)
    throw forbidden("You can only delete your own comments");

  await db.delete(comment).where(eq(comment.id, commentId));
  await audit({
    eventId: row.event.id,
    actor: me,
    action: moderator && row.comment.authorId !== me.userId ? "comment.removed" : "comment.deleted",
    target: row.comment.projectId,
    detail: { body: row.comment.body.slice(0, 200) },
    req,
  });
  return { ok: true };
});
