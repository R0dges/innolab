import { and, desc, eq, like, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db, project, teamMember, vote } from "@/lib/db";
import { id } from "@/lib/ids";
import { isInnolab } from "@/lib/innolab";
import { votingIsOpen } from "@/lib/phase";
import { audit } from "@/lib/server/audit";
import { loadEvent, loadManagedEvent } from "@/lib/server/events";
import {
  badRequest,
  clientIp,
  forbidden,
  HttpError,
  handle,
  notFound,
  readBody,
  unauthorized,
} from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { electorateAllows, resolveVoter, votableProjectIds } from "@/lib/server/voting";
import { dispatch } from "@/lib/server/webhooks";
import { creditsSpent, maxVotesFor, tally, voteCost } from "@/lib/voting";

type P = { event: string };

/** Distinct anonymous voters allowed from one IP address per event. */
const ANON_PER_IP = 3;

/**
 * POST /api/events/:event/votes { projectId, votes } — set how many votes the
 *      caller gives one project (0 removes them). Quadratic: `votes` costs
 *      votes² credits and the caller's total may not exceed the event budget.
 *      Enforced here, in a transaction: voting window, access mode, rate
 *      limits (per IP and per voter), no voting for your own team, and a cap on
 *      anonymous voters per network. Every change is audited.
 * GET  /api/events/:event/votes — organizers only: the live tally plus abuse
 *      signals (voters per IP, burst activity). Never public while voting runs.
 */

const body = z.object({ projectId: z.string().min(1), votes: z.number().int().min(0).max(50) });

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  if (isInnolab(e)) {
    throw forbidden("Innolab projects are evaluated only by appointed judges");
  }
  if (!votingIsOpen(e)) throw forbidden("Voting is not open for this event");
  // Write-up mode collects public input with no counted ballot; the panel
  // decides, so casting a vote is refused (the tally is also withheld below).
  if (e.votingMode === "writeup")
    throw forbidden("This event uses a write-up quest; the judging panel decides");

  const ip = clientIp(req);
  enforceRateLimit(`vote:ip:${e.id}:${ip}`, 60, 60_000);
  const voterState = await resolveVoter(e, me, { createAnon: e.votingAccess === "open" });
  if (voterState.status === "sign-in") throw unauthorized("Sign in to vote in this event");
  if (voterState.status === "verify-email") throw unauthorized("Verify your email address to vote");
  const { voterKey } = voterState;
  enforceRateLimit(`vote:voter:${e.id}:${voterKey}`, 30, 60_000);

  // Electorate lock: only accounts that existed before the cutoff may vote.
  if (!(await electorateAllows(e, me))) {
    await audit({ eventId: e.id, action: "vote.blocked.electorate", detail: { voterKey }, req });
    throw forbidden("Only accounts registered before voting opened can vote in this event");
  }

  const b = await readBody(req, body);
  if (b.votes > maxVotesFor(e.voteBudget))
    throw badRequest(`At most ${maxVotesFor(e.voteBudget)} votes per project`);

  const [target] = await db
    .select({ id: project.id, teamId: project.teamId, status: project.status })
    .from(project)
    .where(and(eq(project.id, b.projectId), eq(project.eventId, e.id)))
    .limit(1);
  if (target?.status !== "submitted") throw notFound("Project not found");

  // Shortlist: when set, only the top-N judged projects are votable.
  const votable = await votableProjectIds(e);
  if (votable && !votable.has(target.id) && b.votes > 0) {
    await audit({
      eventId: e.id,
      action: "vote.blocked.not_shortlisted",
      target: target.id,
      detail: { voterKey },
      req,
    });
    throw forbidden("Only shortlisted finalists can be voted for in this event");
  }

  if (me && target.teamId) {
    const [own] = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, target.teamId), eq(teamMember.userId, me.userId)))
      .limit(1);
    if (own) throw forbidden("You cannot vote for your own team's project");
  }

  if (voterKey.startsWith("anon:")) {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${vote.voterKey})::int` })
      .from(vote)
      .where(
        and(
          eq(vote.eventId, e.id),
          eq(vote.ipAddress, ip),
          like(vote.voterKey, "anon:%"),
          ne(vote.voterKey, voterKey)
        )
      );
    if ((row?.n ?? 0) >= ANON_PER_IP) {
      await audit({ eventId: e.id, action: "vote.blocked.ip_cap", detail: { ip, voterKey }, req });
      throw new HttpError(429, "Too many anonymous voters from this network. Sign in to vote.");
    }
  }

  const spent = await db.transaction(async (tx) => {
    // Serialize this voter's writes so two concurrent requests cannot both pass the budget check.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${e.id}:${voterKey}`}))`);
    const others = await tx
      .select({ votes: vote.votes })
      .from(vote)
      .where(
        and(eq(vote.eventId, e.id), eq(vote.voterKey, voterKey), ne(vote.projectId, b.projectId))
      );
    const total = creditsSpent(others) + voteCost(b.votes);
    if (total > e.voteBudget) {
      throw badRequest(
        `That would cost ${total} credits; you have ${e.voteBudget - creditsSpent(others)} left`
      );
    }
    if (b.votes === 0) {
      await tx
        .delete(vote)
        .where(and(eq(vote.projectId, b.projectId), eq(vote.voterKey, voterKey)));
    } else {
      await tx
        .insert(vote)
        .values({
          id: id.vote(),
          eventId: e.id,
          projectId: b.projectId,
          voterKey,
          votes: b.votes,
          ipAddress: ip,
        })
        .onConflictDoUpdate({
          target: [vote.projectId, vote.voterKey],
          set: { votes: b.votes, ipAddress: ip, updatedAt: new Date() },
        });
    }
    return total;
  });

  await audit({
    eventId: e.id,
    actor: me,
    action: "vote.cast",
    target: b.projectId,
    detail: { votes: b.votes, voterKey },
    req,
  });
  dispatch("vote.cast", { projectId: b.projectId }, e.id);
  return { ok: true, votes: b.votes, spent, remaining: e.voteBudget - spent };
});

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const rows = await db
    .select({
      projectId: vote.projectId,
      voterKey: vote.voterKey,
      votes: vote.votes,
      ip: vote.ipAddress,
      updatedAt: vote.updatedAt,
    })
    .from(vote)
    .where(eq(vote.eventId, e.id))
    .orderBy(desc(vote.updatedAt));
  const titles = new Map(
    (
      await db
        .select({ id: project.id, title: project.title })
        .from(project)
        .where(eq(project.eventId, e.id))
    ).map((p) => [p.id, p.title])
  );

  const byIp = new Map<string, Set<string>>();
  for (const r of rows)
    byIp.set(r.ip ?? "unknown", (byIp.get(r.ip ?? "unknown") ?? new Set()).add(r.voterKey));
  const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
  const perMinute = new Map<number, number>();
  for (const r of rows)
    perMinute.set(minute(r.updatedAt), (perMinute.get(minute(r.updatedAt)) ?? 0) + 1);

  return {
    open: votingIsOpen(e),
    budget: e.voteBudget,
    voters: new Set(rows.map((r) => r.voterKey)).size,
    byKind: {
      user: new Set(rows.filter((r) => r.voterKey.startsWith("user:")).map((r) => r.voterKey)).size,
      email: new Set(rows.filter((r) => r.voterKey.startsWith("email:")).map((r) => r.voterKey))
        .size,
      anon: new Set(rows.filter((r) => r.voterKey.startsWith("anon:")).map((r) => r.voterKey)).size,
    },
    tally: tally(rows).map((t) => ({ ...t, title: titles.get(t.projectId) ?? t.projectId })),
    signals: {
      sharedNetworks: [...byIp.entries()]
        .filter(([, keys]) => keys.size > 1)
        .map(([ip, keys]) => ({ ip, voters: keys.size }))
        .sort((a, b) => b.voters - a.voters)
        .slice(0, 20),
      busiestMinutes: [...perMinute.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([m, n]) => ({ at: new Date(m * 60_000), votes: n })),
    },
    recent: rows.slice(0, 50).map((r) => ({ ...r, title: titles.get(r.projectId) ?? r.projectId })),
  };
});
