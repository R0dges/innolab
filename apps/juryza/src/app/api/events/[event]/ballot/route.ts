import { and, eq } from "drizzle-orm";

import { db, project, team, teamMember, track, vote } from "@/lib/db";
import { hasVoting, votingIsOpen } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { loadEvent } from "@/lib/server/events";
import { handle } from "@/lib/server/http";
import { resolveIdentity } from "@/lib/server/identity";
import { electorateAllows, resolveVoter, votableProjectIds } from "@/lib/server/voting";
import { creditsSpent, maxVotesFor, seededShuffle } from "@/lib/voting";

/**
 * GET /api/events/:event/ballot — the caller's ballot.
 *
 * Projects come in an order shuffled per voter (stable across reloads, different
 * between voters) so nobody benefits from being first on the list. The ballot
 * carries only the caller's own allocations and remaining credits — never
 * anyone's totals. Projects by the caller's own team are marked and cannot be
 * voted for.
 */
export const GET = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  if (!hasVoting(e)) {
    return {
      event: {
        id: e.id,
        slug: e.slug,
        name: e.name,
        votingOpen: e.votingOpen,
        votingClose: e.votingClose,
      },
      enabled: false,
      open: false,
      access: e.votingAccess,
      allowedDomains: e.votingEmailDomains,
      mode: e.votingMode,
      shortlisted: false,
      eligible: false,
      voter: { status: "sign-in" as const },
      budget: e.voteBudget,
      spent: 0,
      maxVotesPerProject: maxVotesFor(e.voteBudget),
      projects: [],
    };
  }
  const voterState = await resolveVoter(e, me, { createAnon: e.votingAccess === "open" });

  const projects = await db
    .select({
      id: project.id,
      title: project.title,
      tagline: project.tagline,
      thumbnailUrl: project.thumbnailUrl,
      teamId: project.teamId,
      trackName: track.name,
      techTags: project.techTags,
    })
    .from(project)
    .leftJoin(track, eq(track.id, project.trackId))
    .where(and(eq(project.eventId, e.id), eq(project.status, "submitted")));

  const voterKey =
    voterState.status === "ready"
      ? voterState.voterKey
      : `anon-preview:${req.headers.get("user-agent") ?? ""}`;
  const mine =
    voterState.status === "ready"
      ? await db
          .select({ projectId: vote.projectId, votes: vote.votes })
          .from(vote)
          .where(and(eq(vote.eventId, e.id), eq(vote.voterKey, voterState.voterKey)))
      : [];
  const myTeamIds = me
    ? new Set(
        (
          await db
            .select({ teamId: teamMember.teamId })
            .from(teamMember)
            .innerJoin(team, eq(team.id, teamMember.teamId))
            .where(and(eq(team.eventId, e.id), eq(teamMember.userId, me.userId)))
        ).map((r) => r.teamId)
      )
    : new Set<string>();
  const allocation = new Map(mine.map((m) => [m.projectId, m.votes]));

  // Anti-abuse levers reflected in the ballot: a shortlist restricts which
  // projects appear, and the electorate lock reports whether this caller may
  // vote at all. Write-up mode presents input without a counted ballot.
  const shortlist = await votableProjectIds(e);
  const shortlisted = shortlist ? projects.filter((p) => shortlist.has(p.id)) : projects;
  const eligible = await electorateAllows(e, me);

  return {
    event: {
      id: e.id,
      slug: e.slug,
      name: e.name,
      votingOpen: e.votingOpen,
      votingClose: e.votingClose,
    },
    enabled: hasVoting(e),
    open: votingIsOpen(e),
    access: e.votingAccess,
    allowedDomains: e.votingEmailDomains,
    mode: e.votingMode,
    shortlisted: shortlist !== null,
    eligible,
    voter:
      voterState.status === "ready" ? { status: "ready", label: voterState.label } : voterState,
    budget: e.voteBudget,
    spent: creditsSpent(mine),
    maxVotesPerProject: maxVotesFor(e.voteBudget),
    projects: seededShuffle(shortlisted, voterKey).map(({ teamId, ...p }) => ({
      ...p,
      trackName: EVENT_TRACKS_ENABLED ? p.trackName : null,
      ownTeam: teamId !== null && myTeamIds.has(teamId),
      myVotes: allocation.get(p.id) ?? 0,
    })),
  };
});
