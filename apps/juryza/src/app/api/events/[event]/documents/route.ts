import { and, desc, eq, sql } from "drizzle-orm";

import { db, eventDocument, user as userTable } from "@/lib/db";
import { id } from "@/lib/ids";
import { audit } from "@/lib/server/audit";
import { canAccessEventWorkspace, documentInput } from "@/lib/server/event-workspace";
import { loadEvent, loadManagedEvent, viewerForEvent } from "@/lib/server/events";
import { created, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";

type P = { event: string };

/** GET current audit document for participants/coaches; managers also receive its history. */
export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  if (!canAccessEventWorkspace(viewer)) {
    throw forbidden("Register for this event to access its audit documents");
  }
  const documents = await db
    .select({
      id: eventDocument.id,
      eventId: eventDocument.eventId,
      kind: eventDocument.kind,
      title: eventDocument.title,
      url: eventDocument.url,
      summary: eventDocument.summary,
      findings: eventDocument.findings,
      problems: eventDocument.problems,
      version: eventDocument.version,
      isCurrent: eventDocument.isCurrent,
      createdBy: eventDocument.createdBy,
      creatorName: userTable.name,
      createdAt: eventDocument.createdAt,
    })
    .from(eventDocument)
    .leftJoin(userTable, eq(userTable.id, eventDocument.createdBy))
    .where(
      and(
        eq(eventDocument.eventId, e.id),
        eq(eventDocument.kind, "audit"),
        viewer?.canManage ? undefined : eq(eventDocument.isCurrent, true)
      )
    )
    .orderBy(desc(eventDocument.version));
  return { documents, current: documents.find((document) => document.isCurrent) ?? null };
});

/** POST a new audit version; the previous document remains available to managers. */
export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadManagedEvent(ref, me);
  const body = await readBody(req, documentInput);
  const documentId = id.eventDocument();
  const version = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`event-document:${e.id}:audit`}))`
    );
    const [latest] = await tx
      .select({ version: sql<number>`coalesce(max(${eventDocument.version}), 0)::int` })
      .from(eventDocument)
      .where(and(eq(eventDocument.eventId, e.id), eq(eventDocument.kind, "audit")));
    const nextVersion = (latest?.version ?? 0) + 1;
    await tx
      .update(eventDocument)
      .set({ isCurrent: false })
      .where(
        and(
          eq(eventDocument.eventId, e.id),
          eq(eventDocument.kind, "audit"),
          eq(eventDocument.isCurrent, true)
        )
      );
    await tx.insert(eventDocument).values({
      id: documentId,
      eventId: e.id,
      kind: "audit",
      title: body.title,
      url: body.url,
      summary: body.summary?.trim() || null,
      findings: body.findings,
      problems: body.problems,
      version: nextVersion,
      isCurrent: true,
      createdBy: me.userId,
    });
    return nextVersion;
  });
  await audit({
    eventId: e.id,
    actor: me,
    action: "event_document.replaced",
    target: documentId,
    detail: { kind: "audit", version, title: body.title },
    req,
  });
  return created({ id: documentId, version });
});
