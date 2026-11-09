import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  event as eventTable,
  pitch,
  pitchTieBreakVote,
  pitchVote,
  project,
  team,
  teamMember,
} from "@/lib/db";
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
  if (!pitchVotingHasClosed(current)) {
    throw forbidden("Close pitch voting before selecting projects");
  }
  if (current.pitchSelectionFinalizedAt) {
    throw conflict("The project selection has already been finalized");
  }

  const body = await readBody(req, input);
  const overview = await pitchSelectionOverview(current.id);
  if (body.count > overview.candidateCount) {
    throw badRequest(`Only ${overview.candidateCount} submitted pitches are available`);
  }

  const finalizedAt = new Date();
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`pitch-selection:${current.id}`}))`
    );
    const [selectionState] = await tx
      .select({
        finalizedAt: eventTable.pitchSelectionFinalizedAt,
        count: eventTable.pitchSelectionCount,
        tieBreakRound: eventTable.pitchTieBreakRound,
        tieBreakCandidateIds: eventTable.pitchTieBreakCandidateIds,
        tieBreakSelectedIds: eventTable.pitchTieBreakSelectedIds,
        tieBreakSlots: eventTable.pitchTieBreakSlots,
      })
      .from(eventTable)
      .where(eq(eventTable.id, current.id))
      .limit(1);
    if (selectionState?.finalizedAt) {
      throw conflict("The project selection has already been finalized");
    }
    if (selectionState?.count !== null && selectionState?.count !== body.count) {
      throw conflict("The project count is locked while coaches resolve the tie");
    }

    const candidates = await tx
      .select({
        id: pitch.id,
        authorId: pitch.authorId,
        title: pitch.title,
        description: pitch.description,
        createdAt: pitch.createdAt,
        votes: sql<number>`count(${pitchVote.id})::int`,
      })
      .from(pitch)
      .leftJoin(pitchVote, eq(pitchVote.pitchId, pitch.id))
      .where(and(eq(pitch.eventId, current.id), eq(pitch.status, "submitted")))
      .groupBy(pitch.id)
      .orderBy(asc(pitch.createdAt), asc(pitch.id));
    if (body.count > candidates.length) {
      throw badRequest(`Only ${candidates.length} submitted pitches are available`);
    }

    const participantRanking = selectRankedPitches(candidates, body.count);
    let tieBreakSelectedIds = selectionState?.tieBreakSelectedIds ?? [];
    let selectedIds: string[] | null = null;

    if (selectionState?.tieBreakRound) {
      const candidateIds = selectionState.tieBreakCandidateIds;
      const slots = selectionState.tieBreakSlots;
      if (!slots || candidateIds.length <= slots) {
        throw conflict("The coach tie-break state is invalid");
      }

      const voteTotals = await tx
        .select({
          pitchId: pitchTieBreakVote.pitchId,
          votes: sql<number>`count(*)::int`,
        })
        .from(pitchTieBreakVote)
        .where(
          and(
            eq(pitchTieBreakVote.eventId, current.id),
            eq(pitchTieBreakVote.round, selectionState.tieBreakRound),
            inArray(pitchTieBreakVote.pitchId, candidateIds)
          )
        )
        .groupBy(pitchTieBreakVote.pitchId);
      const totalsByPitch = new Map(voteTotals.map((row) => [row.pitchId, row.votes]));
      if (voteTotals.reduce((total, row) => total + row.votes, 0) === 0) {
        throw badRequest("At least one coach must vote before finalizing the selection");
      }

      const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const runoffCandidates = candidateIds.map((candidateId) => {
        const candidate = candidatesById.get(candidateId);
        if (!candidate) throw conflict("A tied pitch is no longer available");
        return { ...candidate, votes: totalsByPitch.get(candidateId) ?? 0 };
      });
      const runoff = selectRankedPitches(runoffCandidates, slots);
      tieBreakSelectedIds = [...tieBreakSelectedIds, ...runoff.selectedIds];

      if (runoff.tieCandidateIds.length > 0) {
        const nextRound = selectionState.tieBreakRound + 1;
        await tx
          .update(eventTable)
          .set({
            pitchTieBreakRound: nextRound,
            pitchTieBreakCandidateIds: runoff.tieCandidateIds,
            pitchTieBreakSelectedIds: tieBreakSelectedIds,
            pitchTieBreakSlots: runoff.tieSlots,
            updatedAt: finalizedAt,
          })
          .where(eq(eventTable.id, current.id));
        return {
          kind: "tie-break" as const,
          count: body.count,
          round: nextRound,
          candidatePitchIds: runoff.tieCandidateIds,
          slots: runoff.tieSlots,
          selectedPitchIds: tieBreakSelectedIds,
        };
      }

      selectedIds = [...participantRanking.selectedIds, ...tieBreakSelectedIds];
    } else if (participantRanking.tieCandidateIds.length > 0) {
      await tx
        .update(eventTable)
        .set({
          pitchSelectionCount: body.count,
          pitchSelectionSeed: null,
          pitchTieBreakRound: 1,
          pitchTieBreakCandidateIds: participantRanking.tieCandidateIds,
          pitchTieBreakSelectedIds: [],
          pitchTieBreakSlots: participantRanking.tieSlots,
          updatedAt: finalizedAt,
        })
        .where(eq(eventTable.id, current.id));
      return {
        kind: "tie-break" as const,
        count: body.count,
        round: 1,
        candidatePitchIds: participantRanking.tieCandidateIds,
        slots: participantRanking.tieSlots,
        selectedPitchIds: [] as string[],
      };
    } else {
      selectedIds = participantRanking.selectedIds;
    }

    if (selectedIds.length !== body.count) {
      throw conflict("The coach tie-break did not resolve every remaining place");
    }
    const selectedSet = new Set(selectedIds);
    const selectedCandidates = participantRanking.ranked.filter((candidate) =>
      selectedSet.has(candidate.id)
    );
    const createdProjects = selectedCandidates.map((candidate) => ({
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
      .where(inArray(pitch.id, selectedIds));
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
        pitchSelectionSeed: null,
        pitchTieBreakRound: null,
        pitchTieBreakCandidateIds: [],
        pitchTieBreakSelectedIds: tieBreakSelectedIds,
        pitchTieBreakSlots: null,
        pitchSelectionFinalizedAt: finalizedAt,
        updatedAt: finalizedAt,
      })
      .where(eq(eventTable.id, current.id));

    return {
      kind: "finalized" as const,
      selectedIds,
      cutoffVotes: participantRanking.cutoffVotes,
      projects: createdProjects,
    };
  });

  if (result.kind === "tie-break") {
    await audit({
      eventId: current.id,
      actor: me,
      action: "pitch.tie_break_opened",
      target: current.id,
      detail: {
        algorithm: PITCH_SELECTION_ALGORITHM,
        count: result.count,
        round: result.round,
        candidatePitchIds: result.candidatePitchIds,
        slots: result.slots,
        alreadySelectedPitchIds: result.selectedPitchIds,
      },
      req,
    });
    return {
      finalized: false,
      tieBreak: {
        round: result.round,
        candidatePitchIds: result.candidatePitchIds,
        slots: result.slots,
      },
    };
  }

  await audit({
    eventId: current.id,
    actor: me,
    action: "pitch.selection_finalized",
    target: current.id,
    detail: {
      algorithm: PITCH_SELECTION_ALGORITHM,
      count: body.count,
      participantCount: overview.participantCount,
      recommendedMinimum: overview.recommended.minimum,
      recommendedMaximum: overview.recommended.maximum,
      selectedPitchIds: result.selectedIds,
      cutoffVotes: result.cutoffVotes,
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
    finalized: true,
    selected: result.selectedIds,
    projects: result.projects.map(({ pitchId, projectId, teamId }) => ({
      pitchId,
      projectId,
      teamId,
    })),
  };
});
