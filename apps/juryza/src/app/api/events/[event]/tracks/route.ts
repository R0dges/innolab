import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db, track } from "@/lib/db";
import { id } from "@/lib/ids";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { audit } from "@/lib/server/audit";
import { loadEvent, loadManagedEvent } from "@/lib/server/events";
import { handle, notFound, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";

type P = { event: string };

/**
 * GET /api/events/:event/tracks — the event's tracks (categories).
 * PUT /api/events/:event/tracks — replace the list. Rows with an `id` are
 *     updated in place (projects keep their track), rows without one are
 *     created, and tracks left out are deleted (their projects become untracked).
 */

const list = (eventId: string) =>
  db.select().from(track).where(eq(track.eventId, eventId)).orderBy(asc(track.position));

export const GET = handle<P>(async (req, { event: ref }) => {
  const e = await loadEvent(ref, await resolveIdentity(req));
  if (!EVENT_TRACKS_ENABLED) return { tracks: [] };
  return { tracks: await list(e.id) };
});

const body = z.object({
  tracks: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(60),
        description: z.string().trim().max(400).nullish(),
      })
    )
    .max(30),
});

export const PUT = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  if (!EVENT_TRACKS_ENABLED) throw notFound("Les axes sont désactivés");
  const { tracks } = await readBody(req, body);

  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: track.id }).from(track).where(eq(track.eventId, e.id));
    const existingIds = new Set(existing.map((t) => t.id));
    const keep = tracks
      .map((t) => t.id)
      .filter((x): x is string => Boolean(x && existingIds.has(x)));
    await tx
      .delete(track)
      .where(and(eq(track.eventId, e.id), keep.length ? notInArray(track.id, keep) : undefined));
    for (const [position, t] of tracks.entries()) {
      const values = { name: t.name, description: t.description ?? null, position };
      if (t.id && existingIds.has(t.id)) {
        await tx.update(track).set(values).where(eq(track.id, t.id));
      } else {
        await tx.insert(track).values({ id: id.track(), eventId: e.id, ...values });
      }
    }
  });

  await audit({
    eventId: e.id,
    actor: me,
    action: "tracks.updated",
    detail: { count: tracks.length },
    req,
  });
  return { tracks: await list(e.id) };
});
