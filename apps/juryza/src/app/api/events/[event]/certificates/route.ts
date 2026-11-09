import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { certificate, db, eventJudge, score, user as userTable } from "@/lib/db";
import { id } from "@/lib/ids";
import { EVENT_REWARDS_ENABLED } from "@/lib/platform";
import { audit } from "@/lib/server/audit";
import { newSerial, signCertificate } from "@/lib/server/certificates";
import { loadManagedEvent } from "@/lib/server/events";
import { created, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { computeResults } from "@/lib/server/results";
import { teamMembers } from "@/lib/server/teams";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET  /api/events/:event/certificates — certificates issued for the event.
 * POST /api/events/:event/certificates { kind: "judges" | "winners" } — issue
 *      in bulk (organizers). Judges get a participation record stating how many
 *      reviews they completed; winners (after results are published) get one
 *      per team member per prize. Re-issuing skips people who already have one.
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  return {
    certificates: await db
      .select()
      .from(certificate)
      .where(eq(certificate.eventId, e.id))
      .orderBy(desc(certificate.issuedAt)),
  };
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const { kind } = await readBody(req, z.object({ kind: z.enum(["judges", "winners"]) }));
  if (kind === "winners" && !EVENT_REWARDS_ENABLED) {
    throw forbidden("Winner rewards and certificates are not enabled yet");
  }

  const existing = await db
    .select({
      subjectId: certificate.subjectId,
      kind: certificate.kind,
      statement: certificate.statement,
    })
    .from(certificate)
    .where(eq(certificate.eventId, e.id));
  const have = new Set(existing.map((c) => `${c.kind}:${c.subjectId}:${c.statement}`));

  const toIssue: {
    subjectId: string;
    subjectName: string;
    kind: string;
    statement: string;
    reviews: number;
  }[] = [];
  if (kind === "judges") {
    const judges = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        reviews: sql<number>`(select count(*)::int from ${score} where ${score.eventId} = ${e.id} and ${score.judgeId} = ${userTable.id})`,
      })
      .from(eventJudge)
      .innerJoin(userTable, eq(userTable.id, eventJudge.userId))
      .where(eq(eventJudge.eventId, e.id));
    for (const j of judges.filter((x) => x.reviews > 0)) {
      toIssue.push({
        subjectId: j.id,
        subjectName: j.name,
        kind: "judge",
        statement: `served on the judging panel of ${e.name} and completed ${j.reviews} project review${j.reviews === 1 ? "" : "s"}.`,
        reviews: j.reviews,
      });
    }
  } else {
    if (!e.resultsPublished) throw forbidden("Publish results before issuing winner certificates");
    const results = await computeResults(e);
    for (const p of results.projects.filter((x) => x.awards.length && x.teamId)) {
      const members = await teamMembers(p.teamId as string);
      for (const award of p.awards) {
        for (const m of members) {
          toIssue.push({
            subjectId: m.id,
            subjectName: m.name,
            kind: "winner",
            statement: `won ${award.name}${award.amount ? ` (${award.amount})` : ""} at ${e.name} with “${p.title}”.`,
            reviews: 0,
          });
        }
      }
    }
  }

  const fresh = toIssue.filter((c) => !have.has(`${c.kind}:${c.subjectId}:${c.statement}`));
  const issued = [];
  for (const c of fresh) {
    const record = {
      serial: newSerial(),
      eventId: e.id,
      subjectName: c.subjectName,
      kind: c.kind,
      statement: c.statement,
      reviewsCompleted: c.reviews,
      // Whole seconds, so the signed timestamp survives the database round-trip exactly.
      issuedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
    };
    await db.insert(certificate).values({
      id: id.certificate(),
      subjectId: c.subjectId,
      ...record,
      signature: signCertificate(record),
    });
    issued.push(record.serial);
  }
  await audit({
    eventId: e.id,
    actor: me,
    action: "certificates.issued",
    detail: { kind, count: issued.length },
    req,
  });
  if (issued.length) dispatch("certificate.issued", { kind, serials: issued }, e.id);
  return created({ issued: issued.length, serials: issued });
});
