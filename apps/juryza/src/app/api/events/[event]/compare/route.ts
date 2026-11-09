import { and, eq, inArray } from "drizzle-orm";

import { db, pairwiseVote, project, team, track } from "@/lib/db";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { canManage, isEventCoach, loadEvent, viewerForEvent } from "@/lib/server/events";
import { badRequest, forbidden, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { computeResults } from "@/lib/server/results";
import { buildVectors, cosine, nearest } from "@/lib/similarity";

/**
 * GET /api/events/:event/compare?ids=a,b[,c,d] — side-by-side comparison.
 *
 * Pass one id and the server picks the rivals automatically: the most similar
 * submissions by content, plus (once results are visible) the projects ranked
 * immediately above and below it. For every set it returns the projects, a
 * pairwise content-similarity matrix, head-to-head pairwise-judging records,
 * and — when results are published or the caller organizes the event — the
 * rank, normalized score, per-criterion means and community votes of each.
 */
export const GET = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  if (!viewer?.registered && !viewer?.isJudge && !viewer?.canManage) {
    throw forbidden("Les projets sont réservés aux participants et coachs de cet événement");
  }
  const requested = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (requested.length === 0) throw badRequest("Pass ?ids= with one to four project ids");

  const all = await db
    .select({
      id: project.id,
      title: project.title,
      tagline: project.tagline,
      description: project.description,
      thumbnailUrl: project.thumbnailUrl,
      repoUrl: project.repoUrl,
      liveUrl: project.liveUrl,
      techTags: project.techTags,
      trackName: track.name,
      teamName: team.name,
    })
    .from(project)
    .leftJoin(track, eq(track.id, project.trackId))
    .leftJoin(team, eq(team.id, project.teamId))
    .where(and(eq(project.eventId, e.id), eq(project.status, "submitted")));

  const showScores =
    e.resultsPublished || canManage(me, e) || (await isEventCoach(e.id, me.userId));
  const results = showScores ? await computeResults(e) : null;
  const resultById = new Map(results?.projects.map((r) => [r.id, r]));

  let ids = requested.filter((pid) => all.some((p) => p.id === pid));
  const auto = ids.length === 1;
  if (auto) {
    const anchor = ids[0] as string;
    const picks = new Set([anchor]);
    for (const n of nearest(all, anchor, 2)) picks.add(n.id);
    const rank = resultById.get(anchor)?.rank;
    if (rank && results) {
      for (const r of results.projects) {
        if (picks.size >= 4) break;
        if (r.rank === rank - 1 || r.rank === rank + 1) picks.add(r.id);
      }
    }
    ids = [...picks];
  }
  if (ids.length < 2 && !auto) throw badRequest("Pick at least two submitted projects to compare");

  const chosen = ids.map((pid) => all.find((p) => p.id === pid)).filter((p) => p !== undefined);
  const vectors = buildVectors(all);
  const vecOf = new Map(all.map((p, i) => [p.id, vectors[i] as Map<string, number>]));
  const similarity = chosen.map((a) =>
    chosen.map((b) =>
      a.id === b.id
        ? 1
        : cosine(vecOf.get(a.id) as Map<string, number>, vecOf.get(b.id) as Map<string, number>)
    )
  );

  const h2h =
    showScores && chosen.length
      ? await db
          .select({ winnerId: pairwiseVote.winnerId, loserId: pairwiseVote.loserId })
          .from(pairwiseVote)
          .where(
            and(
              eq(pairwiseVote.eventId, e.id),
              inArray(pairwiseVote.winnerId, ids),
              inArray(pairwiseVote.loserId, ids)
            )
          )
      : [];

  return {
    auto,
    showScores,
    criteria: results?.criteria ?? [],
    projects: chosen.map((p) => {
      const r = resultById.get(p.id);
      return {
        ...p,
        trackName: EVENT_TRACKS_ENABLED ? p.trackName : null,
        description: p.description?.slice(0, 600) ?? null,
        result: r
          ? {
              rank: r.rank,
              trackRank: r.trackRank,
              normalized: r.normalized,
              raw: r.raw,
              reviews: r.reviews,
              criteria: r.criteria,
              votes: r.votes,
              pairwise: r.pairwise,
              awards: r.awards,
            }
          : null,
      };
    }),
    similarity,
    headToHead: h2h,
  };
});
