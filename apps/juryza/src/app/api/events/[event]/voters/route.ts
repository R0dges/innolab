import { cookies } from "next/headers";

import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, voter } from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { isInnolab } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { loadEvent } from "@/lib/server/events";
import { badRequest, clientIp, forbidden, handle, readBody } from "@/lib/server/http";
import { hashToken, resolveIdentity } from "@/lib/server/identity";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { emailAllowed, voterCookie } from "@/lib/server/voting";

type P = { event: string };

/**
 * Email-gated voting.
 *
 * POST /api/events/:event/voters { email }        — send a 6-digit code.
 * POST /api/events/:event/voters { email, code }  — verify it; sets the voter
 *      cookie that identifies this browser as that address for this event.
 *
 * Offline by design: there is no mail provider, so the code is written to the
 * server log (like password resets). Swap `deliverCode` for your mailer in
 * production. Codes are stored hashed, expire after 15 minutes and allow five
 * attempts; requests are rate limited per IP and per address.
 */

const body = z.object({
  email: z.email().transform((s) => s.trim().toLowerCase()),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

function deliverCode(email: string, code: string, eventName: string) {
  console.info(`[voting] verification code for ${email} (${eventName}): ${code}`);
}

export const POST = handle<P>(async (req, { event: ref }) => {
  const e = await loadEvent(ref, await resolveIdentity(req));
  if (isInnolab(e)) {
    throw forbidden("Innolab projects are evaluated only by appointed judges");
  }
  if (e.votingAccess !== "email") throw badRequest("This event does not use email-verified voting");
  const { email, code } = await readBody(req, body);
  if (!emailAllowed(e, email)) {
    throw forbidden(
      `Voting is limited to ${e.votingEmailDomains.map((d) => `@${d.replace(/^@/, "")}`).join(", ")} addresses`
    );
  }
  const ip = clientIp(req);

  if (!code) {
    enforceRateLimit(`voter-code:ip:${ip}`, 5, 10 * 60_000);
    enforceRateLimit(`voter-code:email:${e.id}:${email}`, 3, 10 * 60_000);
    const fresh = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db
      .insert(voter)
      .values({ id: id.voter(), eventId: e.id, email, codeHash: hashToken(fresh) })
      .onConflictDoUpdate({
        target: [voter.eventId, voter.email],
        set: { codeHash: hashToken(fresh), attempts: 0, createdAt: new Date() },
      });
    deliverCode(email, fresh, e.name);
    await audit({ eventId: e.id, action: "voter.code_sent", detail: { email }, req });
    return { sent: true };
  }

  enforceRateLimit(`voter-verify:ip:${ip}`, 20, 10 * 60_000);
  const [v] = await db
    .select()
    .from(voter)
    .where(and(eq(voter.eventId, e.id), eq(voter.email, email)))
    .limit(1);
  if (!v) throw badRequest("Request a code first");
  if (v.attempts >= 5) throw forbidden("Too many attempts — request a new code");
  if (Date.now() - v.createdAt.getTime() > 15 * 60_000)
    throw badRequest("That code has expired — request a new one");
  if (v.codeHash !== hashToken(code)) {
    await db
      .update(voter)
      .set({ attempts: v.attempts + 1 })
      .where(eq(voter.id, v.id));
    throw badRequest("That code is not right");
  }

  const session = secretToken(32);
  await db
    .update(voter)
    .set({
      verifiedAt: new Date(),
      sessionHash: hashToken(session),
      codeHash: hashToken(secretToken()),
    })
    .where(eq(voter.id, v.id));
  (await cookies()).set(voterCookie(e.id), session, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  await audit({ eventId: e.id, action: "voter.verified", detail: { email }, req });
  return { verified: true };
});
