import { cookies } from "next/headers";

import { and, eq, isNotNull } from "drizzle-orm";

import type { Event } from "@/lib/db";
import { db, user as userTable, voter } from "@/lib/db";
import { secretToken } from "@/lib/ids";
import { hashToken, type Identity } from "@/lib/server/identity";
import { computeResults } from "@/lib/server/results";

/**
 * Who is voting? Resolves the caller to a stable `voterKey` under the event's
 * access mode — the identity every duplicate check and budget is keyed on.
 *
 *  - `authenticated`: signed-in users only → `user:<id>`.
 *  - `email`: an address proven with a one-time code (optionally restricted to
 *    allowed domains) → `email:<address>`. Signed-in users vote as themselves.
 *  - `open`: anyone with the link. Signed-in users vote as themselves; anonymous
 *    voters get an httpOnly cookie → `anon:<cookie>`, further limited per IP.
 */

export type VoterState =
  | { status: "ready"; voterKey: string; label: string }
  | { status: "sign-in" }
  | { status: "verify-email" };

const ANON_COOKIE = "jz_anon";
export const voterCookie = (eventId: string) => `jz_voter_${eventId}`;

export async function resolveVoter(
  e: Event,
  me: Identity | null,
  opts: { createAnon?: boolean } = {}
): Promise<VoterState> {
  if (me) return { status: "ready", voterKey: `user:${me.userId}`, label: me.name };
  if (e.votingAccess === "authenticated") return { status: "sign-in" };

  const jar = await cookies();
  if (e.votingAccess === "email") {
    const token = jar.get(voterCookie(e.id))?.value;
    if (!token) return { status: "verify-email" };
    const [v] = await db
      .select({ email: voter.email })
      .from(voter)
      .where(
        and(
          eq(voter.eventId, e.id),
          eq(voter.sessionHash, hashToken(token)),
          isNotNull(voter.verifiedAt)
        )
      )
      .limit(1);
    return v
      ? { status: "ready", voterKey: `email:${v.email}`, label: v.email }
      : { status: "verify-email" };
  }

  let anon = jar.get(ANON_COOKIE)?.value;
  if (!anon && opts.createAnon) {
    anon = secretToken(24);
    jar.set(ANON_COOKIE, anon, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
    });
  }
  return anon
    ? { status: "ready", voterKey: `anon:${hashToken(anon).slice(0, 32)}`, label: "Guest voter" }
    : { status: "verify-email" };
}

export function emailAllowed(e: Pick<Event, "votingEmailDomains">, email: string): boolean {
  if (e.votingEmailDomains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return e.votingEmailDomains.some(
    (d) => domain === d.replace(/^@/, "") || domain.endsWith(`.${d.replace(/^@/, "")}`)
  );
}

/**
 * Anti-abuse levers, all enforced server-side and all no-ops at their defaults.
 * These implement the mechanisms documented at `/docs/voting`, drawn from the
 * ways community voting is repeatedly gamed.
 */

/**
 * Electorate lock: when `votingElectorateLockAt` is set, only signed-in accounts
 * created on or before that instant may vote — automating the "member before
 * kickoff" rule without a hand-maintained list. Anonymous and email voters have
 * no account age, so the lock only applies to `user:` voters; organizers who
 * want the lock should pair it with the `authenticated` access mode.
 */
export async function electorateAllows(
  e: Pick<Event, "votingElectorateLockAt">,
  me: Identity | null
): Promise<boolean> {
  const lockAt = e.votingElectorateLockAt;
  if (!lockAt || !me) return !lockAt; // no lock → allow; lock set but no account → deny
  const [row] = await db
    .select({ createdAt: userTable.createdAt })
    .from(userTable)
    .where(eq(userTable.id, me.userId))
    .limit(1);
  return !!row && row.createdAt.getTime() <= new Date(lockAt).getTime();
}

/**
 * The set of project ids a community vote may target. When
 * `votingShortlistSize` is 0 every submitted project is votable; otherwise only
 * the top N by judged rank, so a poll runs on the finalists alone. `null` means
 * "no restriction" and the caller need not check membership.
 */
export async function votableProjectIds(
  e: Pick<Event, "id" | "workflow" | "votingShortlistSize">
): Promise<Set<string> | null> {
  if (!e.votingShortlistSize || e.votingShortlistSize <= 0) return null;
  const { projects } = await computeResults(e);
  const shortlisted = projects
    .filter((p) => p.rank !== null)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .slice(0, e.votingShortlistSize)
    .map((p) => p.id);
  return new Set(shortlisted);
}
