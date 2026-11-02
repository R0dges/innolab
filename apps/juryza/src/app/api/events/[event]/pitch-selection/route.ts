import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db, event as eventTable, pitch, pitchVote, project, team, teamMember } from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { isInnolab, pitchVotingHasClosed } from "@/lib/innolab";
import { textToDoc } from "@/lib/rich-text";
import { audit } from "@/lib/server/audit";
import { loadCoachedEvent } from "@/lib/server/events";
import { badRequest, conflict, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import {
  PITCH_SELECTION_ALGORITHM,
  pitchSelectionOverview,
  selectRankedPitches,
} from "@/lib/server/pitch-selection";
import { dispatch } from "@/lib/server/webhooks";

const input = z.object({ count: z.number().int().min(1).max(100) });

export const POST = handle<{ event: string }>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const current = await loadCoachedEvent(ref, me);
  if (!isInnolab(current)) throw notFound("This event does not use the Innolab journey");
  if (!current.pitchPresentationOpenedAt) {
    throw forbidden("Open the pitch presentation session before finalizing projects");
  }
  if (!pitchVotingHasClosed(current))
    throw forbidden("Close pitch voting before selecting projects");
  if (current.pitchSelectionFinalizedAt) {
    throw conflict("The project selection has already been finalized");
  }

  const body = await readBody(req, input);
  const overview = await pitchSelectionOverview(current.id);
  if (body.count > overview.candidateCount) {
    throw badRequest(`Only ${overview.candidateCount} submitted pitches are available`);
  }

  const seed = secretToken(32);
  const finalizedAt = new Date();
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`pitch-selection:${current.id}`}))`
    );
    const [selectionState] = await tx
      .select({ finalizedAt: eventTable.pitchSelectionFinalizedAt })
      .from(eventTable)
      .where(eq(eventTable.id, current.id))
      .limit(1);
    if (selectionState?.finalizedAt) {
      throw conflict("The project selection has already been finalized");
    }

    const candidates = await tx
      .select({
        id: pitch.id,
        authorId: pitch.authorId,
        title: pitch.title,
        description: pitch.description,
        votes: sql<number>`(select count(*)::int from ${pitchVote} where ${pitchVote.pitchId} = ${pitch.id})`,
      })
      .from(pitch)
      .where(and(eq(pitch.eventId, current.id), eq(pitch.status, "submitted")));
    if (body.count > candidates.length) {
      throw badRequest(`Only ${candidates.length} submitted pitches are available`);
    }

    const ranked = selectRankedPitches(candidates, body.count, seed);
    const createdProjects = ranked.selected.map((candidate) => ({
      pitchId: candidate.id,
      authorId: candidate.authorId,
      teamId: id.team(),
      projectId: id.project(),
      teamName: candidate.title.slice(0, 60),
      title: candidate.title,
      description: candidate.description,
    }));

    await tx
      .update(pitch)
      .set({ status: "rejected", updatedAt: finalizedAt })
      .where(and(eq(pitch.eventId, current.id), eq(pitch.status, "submitted")));
    await tx
      .update(pitch)
      .set({ status: "selected", updatedAt: finalizedAt })
      .where(inArray(pitch.id, ranked.selectedIds));
    await tx.insert(team).values(
      createdProjects.map((createdProject) => ({
        id: createdProject.teamId,
        eventId: current.id,
        name: createdProject.teamName,
        lookingForMembers: true,
        inviteToken: secretToken(24),
      }))
    );
    await tx.insert(teamMember).values(
      createdProjects.map((createdProject) => ({
        teamId: createdProject.teamId,
        userId: createdProject.authorId,
        role: "owner",
      }))
    );
    await tx.insert(project).values(
      createdProjects.map((createdProject) => ({
        id: createdProject.projectId,
        eventId: current.id,
        teamId: createdProject.teamId,
        pitchId: createdProject.pitchId,
        title: createdProject.title,
        description: createdProject.description,
        content: textToDoc(createdProject.description),
        status: "draft",
      }))
    );
    await tx
      .update(eventTable)
      .set({
        pitchSelectionCount: body.count,
        pitchSelectionSeed: seed,
        pitchSelectionFinalizedAt: finalizedAt,
        updatedAt: finalizedAt,
      })
      .where(eq(eventTable.id, current.id));

    return { ...ranked, projects: createdProjects };
  });

  await audit({
    eventId: current.id,
    actor: me,
    action: "pitch.selection_finalized",
    target: current.id,
    detail: {
      algorithm: PITCH_SELECTION_ALGORITHM,
      seed,
      count: body.count,
      participantCount: overview.participantCount,
      recommendedMinimum: overview.recommended.minimum,
      recommendedMaximum: overview.recommended.maximum,
      selectedPitchIds: result.selectedIds,
      cutoffVotes: result.cutoffVotes,
      tieCandidateIds: result.tieCandidateIds,
      tieSelectedIds: result.tieSelectedIds,
      projects: result.projects.map(({ pitchId, projectId, teamId }) => ({
        pitchId,
        projectId,
        teamId,
      })),
    },
    req,
  });
  for (const createdProject of result.projects) {
    dispatch(
      "team.created",
      { teamId: createdProject.teamId, name: createdProject.teamName },
      current.id
    );
  }

  return {
    selected: result.selectedIds,
    projects: result.projects.map(({ pitchId, projectId, teamId }) => ({
      pitchId,
      projectId,
      teamId,
    })),
    tieBreak: {
      algorithm: PITCH_SELECTION_ALGORITHM,
      seed,
      candidatePitchIds: result.tieCandidateIds,
      selectedPitchIds: result.tieSelectedIds,
    },
  };
});
