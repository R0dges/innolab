import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, pitch, pitchVote, project, user as userTable } from "@/lib/db";
import { id } from "@/lib/ids";
import {
  innolabProjectFormationIsOpen,
  isInnolab,
  pitchSubmissionsAreOpen,
  pitchVotingHasClosed,
  pitchVotingIsOpen,
} from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { loadEvent } from "@/lib/server/events";
import { created, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { pitchVoteRights } from "@/lib/server/pitches";

type P = { event: string };

const pitchInput = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(3000),
  submit: z.boolean().default(false),
});

export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  if (!isInnolab(e)) throw notFound("This event does not use the Innolab journey");

  const rights = await pitchVoteRights(e.id, me, e.createdBy);
  const rows = await db
    .select({
      id: pitch.id,
      eventId: pitch.eventId,
      authorId: pitch.authorId,
      authorName: userTable.name,
      authorUsername: userTable.username,
      authorImage: userTable.image,
      title: pitch.title,
      description: pitch.description,
      status: pitch.status,
      submittedAt: pitch.submittedAt,
      createdAt: pitch.createdAt,
      updatedAt: pitch.updatedAt,
      votes: sql<number>`(select count(*)::int from ${pitchVote} where ${pitchVote.pitchId} = ${pitch.id})`,
      projectId: sql<
        string | null
      >`(select ${project.id} from ${project} where ${project.pitchId} = ${pitch.id} limit 1)`,
    })
    .from(pitch)
    .innerJoin(userTable, eq(userTable.id, pitch.authorId))
    .where(eq(pitch.eventId, e.id))
    .orderBy(asc(pitch.createdAt));

  const myVotes = me
    ? new Set(
        (
          await db
            .select({ pitchId: pitchVote.pitchId })
            .from(pitchVote)
            .innerJoin(pitch, eq(pitch.id, pitchVote.pitchId))
            .where(and(eq(pitch.eventId, e.id), eq(pitchVote.voterId, me.userId)))
        ).map((row) => row.pitchId)
      )
    : new Set<string>();
  const showVoteCounts = rights.manager || pitchVotingHasClosed(e);
  const visible = rows.filter(
    (row) => row.status !== "draft" || rights.manager || row.authorId === me?.userId
  );

  return {
    event: {
      id: e.id,
      slug: e.slug,
      name: e.name,
      workflow: e.workflow,
      pitchSubmissionsOpen: e.pitchSubmissionsOpen,
      pitchSubmissionsClose: e.pitchSubmissionsClose,
      pitchVotingOpen: e.pitchVotingOpen,
      pitchVotingClose: e.pitchVotingClose,
      submissionsOpen: e.submissionsOpen,
      submissionsClose: e.submissionsClose,
    },
    pitches: visible.map((row) => ({
      ...row,
      votes: showVoteCounts ? row.votes : null,
      voted: myVotes.has(row.id),
      mine: row.authorId === me?.userId,
    })),
    viewer: me
      ? {
          userId: me.userId,
          registered: rights.registered,
          canManage: rights.manager,
          canCreate: rights.registered && pitchSubmissionsAreOpen(e),
          canVote: rights.canVote && pitchVotingIsOpen(e),
        }
      : null,
    phase: {
      submissionsOpen: pitchSubmissionsAreOpen(e),
      votingOpen: pitchVotingIsOpen(e),
      votingClosed: pitchVotingHasClosed(e),
      formationOpen: innolabProjectFormationIsOpen(e),
      showVoteCounts,
    },
  };
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  if (!isInnolab(e)) throw notFound("This event does not use the Innolab journey");
  const rights = await pitchVoteRights(e.id, me, e.createdBy);
  if (!rights.registered) throw forbidden("Register for this event before proposing an idea");
  if (!pitchSubmissionsAreOpen(e)) throw forbidden("Idea submissions are closed");
  const body = await readBody(req, pitchInput);
  const pitchId = id.pitch();
  await db.insert(pitch).values({
    id: pitchId,
    eventId: e.id,
    authorId: me.userId,
    title: body.title,
    description: body.description,
    status: body.submit ? "submitted" : "draft",
    submittedAt: body.submit ? new Date() : null,
  });
  await audit({
    eventId: e.id,
    actor: me,
    action: body.submit ? "pitch.submitted" : "pitch.created",
    target: pitchId,
    req,
  });
  return created({ id: pitchId, status: body.submit ? "submitted" : "draft" });
});
