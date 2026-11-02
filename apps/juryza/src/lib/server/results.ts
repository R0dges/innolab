import { asc, eq, inArray } from "drizzle-orm";

import { bradleyTerry } from "@/lib/bradley-terry";
import type { Event } from "@/lib/db";
import {
  db,
  pairwiseVote,
  prize,
  project,
  rubricCriterion,
  score,
  team,
  track,
  user as userTable,
  vote,
} from "@/lib/db";
import { judgeStats, normalizeScores, rawScore } from "@/lib/scoring";
import { tally } from "@/lib/voting";

/**
 * The results engine: every number on the leaderboard, the organizer
 * dashboard, the CSV export and the compare view comes from this one function,
 * so they cannot disagree.
 *
 * For each submitted project it computes
 *  - `raw`: mean of judges' weighted rubric scores,
 *  - `normalized`: mean of per-judge z-score-normalized scores (JUDGING.md),
 *  - `criteria`: mean mark per rubric criterion,
 *  - `favorites`: number of coaches who awarded their single +1 bonus,
 *  - `rank` / `rawRank` / `trackRank`,
 *  - community `votes` (quadratic tally) and pairwise Bradley–Terry strength,
 *  - the `awards` it wins under the event's prize table.
 */

export type EventResults = Awaited<ReturnType<typeof computeResults>>;
export type ProjectResult = EventResults["projects"][number];

export async function computeResults(e: Pick<Event, "id">) {
  const [criteria, projects, scores, votes, comparisons, prizes] = await Promise.all([
    db
      .select()
      .from(rubricCriterion)
      .where(eq(rubricCriterion.eventId, e.id))
      .orderBy(asc(rubricCriterion.position)),
    db
      .select({
        id: project.id,
        title: project.title,
        tagline: project.tagline,
        thumbnailUrl: project.thumbnailUrl,
        trackId: project.trackId,
        trackName: track.name,
        teamId: project.teamId,
        teamName: team.name,
        status: project.status,
      })
      .from(project)
      .leftJoin(track, eq(track.id, project.trackId))
      .leftJoin(team, eq(team.id, project.teamId))
      .where(eq(project.eventId, e.id)),
    db
      .select({
        judgeId: score.judgeId,
        projectId: score.projectId,
        criteria: score.criteria,
        favorite: score.favorite,
      })
      .from(score)
      .where(eq(score.eventId, e.id)),
    db
      .select({ projectId: vote.projectId, voterKey: vote.voterKey, votes: vote.votes })
      .from(vote)
      .where(eq(vote.eventId, e.id)),
    db
      .select({ winnerId: pairwiseVote.winnerId, loserId: pairwiseVote.loserId })
      .from(pairwiseVote)
      .where(eq(pairwiseVote.eventId, e.id)),
    db.select().from(prize).where(eq(prize.eventId, e.id)).orderBy(asc(prize.rank)),
  ]);

  const submitted = projects.filter((p) => p.status === "submitted");
  const submittedIds = new Set(submitted.map((p) => p.id));
  const scored = scores.filter((s) => submittedIds.has(s.projectId));

  const rows = scored.map((s) => ({
    judgeId: s.judgeId,
    projectId: s.projectId,
    raw: rawScore(s.criteria, criteria, s.favorite),
  }));
  const normalized = normalizeScores(rows);

  const group = <T>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return m;
  };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const normByProject = group(normalized, (r) => r.projectId);
  const scoresByProject = group(scored, (s) => s.projectId);
  const voteTally = new Map(
    tally(votes.filter((v) => submittedIds.has(v.projectId))).map((t) => [t.projectId, t])
  );
  const bt = new Map(
    bradleyTerry(
      comparisons.filter((c) => submittedIds.has(c.winnerId) && submittedIds.has(c.loserId))
    ).map((b) => [b.projectId, b])
  );

  const base = submitted.map((p) => {
    const norm = normByProject.get(p.id) ?? [];
    const marks = scoresByProject.get(p.id) ?? [];
    const perCriterion: Record<string, number | null> = {};
    for (const c of criteria) {
      const xs = marks
        .map((m) => m.criteria[c.key])
        .filter((x): x is number => typeof x === "number");
      perCriterion[c.key] = xs.length ? mean(xs) : null;
    }
    const t = voteTally.get(p.id);
    const b = bt.get(p.id);
    return {
      ...p,
      reviews: norm.length,
      raw: norm.length ? mean(norm.map((r) => r.raw)) : null,
      normalized: norm.length ? mean(norm.map((r) => r.normalized)) : null,
      criteria: perCriterion,
      favorites: marks.filter((mark) => mark.favorite).length,
      votes: t?.votes ?? 0,
      voters: t?.voters ?? 0,
      pairwise: b
        ? { strength: b.strength, scaled: b.scaled, wins: b.wins, losses: b.losses }
        : null,
    };
  });

  const rankBy = (xs: typeof base, value: (x: (typeof base)[number]) => number | null) => {
    const ranked = xs
      .filter((x) => value(x) !== null)
      .sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0));
    return new Map(ranked.map((x, i) => [x.id, i + 1]));
  };
  const rank = rankBy(base, (x) => x.normalized);
  const rawRank = rankBy(base, (x) => x.raw);
  const communityRank = rankBy(
    base.filter((x) => x.votes > 0),
    (x) => x.votes
  );
  const trackRank = new Map<string, number>();
  for (const [, inTrack] of group(base, (x) => x.trackId ?? "")) {
    for (const [pid, r] of rankBy(inTrack, (x) => x.normalized)) trackRank.set(pid, r);
  }

  // Prize allocation: overall prizes by judged rank, track prizes by rank within
  // their track, community prizes by vote tally.
  const awards = new Map<string, { prizeId: string; name: string; amount: string | null }[]>();
  const award = (projectId: string | undefined, pz: (typeof prizes)[number]) => {
    if (!projectId) return;
    awards.set(projectId, [
      ...(awards.get(projectId) ?? []),
      { prizeId: pz.id, name: pz.name, amount: pz.amount },
    ]);
  };
  const byRank = (m: Map<string, number>, r: number, filter?: (id: string) => boolean) =>
    [...m.entries()].find(([pid, v]) => v === r && (!filter || filter(pid)))?.[0];
  for (const pz of prizes) {
    if (pz.kind === "overall") award(byRank(rank, pz.rank), pz);
    else if (pz.kind === "community") award(byRank(communityRank, pz.rank), pz);
    else if (pz.kind === "track" && pz.trackId) {
      award(
        byRank(trackRank, pz.rank, (pid) => base.find((b) => b.id === pid)?.trackId === pz.trackId),
        pz
      );
    }
  }

  const results = base
    .map((x) => ({
      ...x,
      rank: rank.get(x.id) ?? null,
      rawRank: rawRank.get(x.id) ?? null,
      trackRank: trackRank.get(x.id) ?? null,
      communityRank: communityRank.get(x.id) ?? null,
      awards: awards.get(x.id) ?? [],
    }))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.title.localeCompare(b.title));

  const judgeIds = [...new Set(rows.map((r) => r.judgeId))];
  const judges = judgeIds.length
    ? await db
        .select({ id: userTable.id, name: userTable.name, username: userTable.username })
        .from(userTable)
        .where(inArray(userTable.id, judgeIds))
    : [];
  const judgeById = new Map(judges.map((j) => [j.id, j]));
  const stats = judgeStats(rows).map((s) => ({
    ...s,
    name: judgeById.get(s.judgeId)?.name ?? s.judgeId,
    username: judgeById.get(s.judgeId)?.username ?? null,
  }));

  return {
    criteria: criteria.map((c) => ({ key: c.key, label: c.label, weight: c.weight })),
    prizes,
    projects: results,
    judges: stats,
    totals: {
      submitted: submitted.length,
      scores: scored.length,
      voters: new Set(votes.map((v) => v.voterKey)).size,
      comparisons: comparisons.length,
    },
  };
}
