import { and, eq } from "drizzle-orm";

import { db, project, track } from "@/lib/db";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { handle, notFound } from "@/lib/server/http";
import { nearest } from "@/lib/similarity";

/** GET /api/projects/:id/similar — the submissions most like this one (public). */
export const GET = handle<{ id: string }>(async (_req, { id: projectId }) => {
  const [p] = await db
    .select({ eventId: project.eventId, status: project.status })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (p?.status !== "submitted") throw notFound("Project not found");
  const all = await db
    .select({
      id: project.id,
      title: project.title,
      tagline: project.tagline,
      description: project.description,
      techTags: project.techTags,
      thumbnailUrl: project.thumbnailUrl,
      trackName: track.name,
    })
    .from(project)
    .leftJoin(track, eq(track.id, project.trackId))
    .where(and(eq(project.eventId, p.eventId), eq(project.status, "submitted")));
  const byId = new Map(all.map((x) => [x.id, x]));
  return {
    similar: nearest(all, projectId, 4).map((n) => {
      const { description: _d, ...rest } = byId.get(n.id) as (typeof all)[number];
      return {
        ...rest,
        trackName: EVENT_TRACKS_ENABLED ? rest.trackName : null,
        score: n.score,
      };
    }),
  };
});
