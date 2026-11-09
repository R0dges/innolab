import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db, pitch, project, projectJoinRequest, registration, user as userTable } from "@/lib/db";
import { id } from "@/lib/ids";
import { innolabProjectFormationIsOpen, isInnolab } from "@/lib/innolab";
import { audit } from "@/lib/server/audit";
import { canManage, findEvent, isPanelJudge, teamOf } from "@/lib/server/events";
import { conflict, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import { type Identity, requireUser } from "@/lib/server/identity";
import { findTeam, joinTeam, memberCount } from "@/lib/server/teams";
import { dispatch } from "@/lib/server/webhooks";

type P = { id: string };

/**
 * Innolab project membership workflow.
 *
 * GET    lists pending requests for the project owner and event coaches.
 * POST   creates the caller's request; it never grants membership directly.
 * PATCH  lets the project owner or an event coach approve/reject one request.
 * DELETE lets the caller cancel their own pending request.
 */

async function context(teamId: string) {
  const target = await findTeam(teamId);
  if (!target) throw notFound("Project team not found");
  const event = await findEvent(target.eventId);
  if (!event || !isInnolab(event)) throw notFound("Project team not found");

  const [selectedProject] = await db
    .select({ id: project.id })
    .from(project)
    .innerJoin(pitch, eq(pitch.id, project.pitchId))
    .where(
      and(
        eq(project.teamId, target.id),
        eq(project.eventId, event.id),
        eq(pitch.eventId, event.id),
        eq(pitch.status, "selected")
      )
    )
    .limit(1);
  if (!selectedProject) throw notFound("Selected project not found");
  return { target, event, selectedProject };
}

async function canReview(eventId: string, me: Identity) {
  const [coach, event] = await Promise.all([isPanelJudge(eventId, me.userId), findEvent(eventId)]);
  return coach || Boolean(event && canManage(me, event));
}

export const GET = handle<P>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const { event, selectedProject } = await context(teamId);
  if (!(await canReview(event.id, me))) {
    throw forbidden("Seul un coach rattaché à l'événement peut traiter les demandes");
  }

  const requests = await db
    .select({
      id: projectJoinRequest.id,
      status: projectJoinRequest.status,
      createdAt: projectJoinRequest.createdAt,
      participant: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        username: userTable.username,
        image: userTable.image,
        headline: userTable.headline,
      },
    })
    .from(projectJoinRequest)
    .innerJoin(userTable, eq(userTable.id, projectJoinRequest.userId))
    .where(
      and(
        eq(projectJoinRequest.projectId, selectedProject.id),
        eq(projectJoinRequest.status, "pending")
      )
    )
    .orderBy(asc(projectJoinRequest.createdAt));

  return { requests };
});

export const POST = handle<P>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const { target, event, selectedProject } = await context(teamId);
  if (!innolabProjectFormationIsOpen(event)) {
    throw forbidden("Project registration is closed for this event");
  }
  if (!target.lookingForMembers) throw forbidden("This project is not accepting requests");

  const [[registered], currentTeam, [pending], count] = await Promise.all([
    db
      .select({ userId: registration.userId })
      .from(registration)
      .where(and(eq(registration.eventId, event.id), eq(registration.userId, me.userId)))
      .limit(1),
    teamOf(event.id, me.userId),
    db
      .select({ id: projectJoinRequest.id, projectId: projectJoinRequest.projectId })
      .from(projectJoinRequest)
      .where(
        and(
          eq(projectJoinRequest.eventId, event.id),
          eq(projectJoinRequest.userId, me.userId),
          eq(projectJoinRequest.status, "pending")
        )
      )
      .limit(1),
    memberCount(teamId),
  ]);
  if (!registered) throw forbidden("Register for this event before requesting a project");
  if (currentTeam) {
    throw conflict(`You already belong to "${currentTeam.name}" for this event`);
  }
  if (count >= event.maxTeamSize) throw conflict("This project team is full");
  if (pending) {
    if (pending.projectId === selectedProject.id) {
      return { requestId: pending.id, status: "pending", alreadyRequested: true };
    }
    throw conflict("You already have a pending request for another project in this event");
  }

  const requestId = id.projectJoinRequest();
  const updatedAt = new Date();
  const [storedRequest] = await db
    .insert(projectJoinRequest)
    .values({
      id: requestId,
      eventId: event.id,
      projectId: selectedProject.id,
      userId: me.userId,
      status: "pending",
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [projectJoinRequest.projectId, projectJoinRequest.userId],
      set: { status: "pending", reviewedBy: null, reviewedAt: null, updatedAt },
    })
    .returning({ id: projectJoinRequest.id });

  await audit({
    eventId: event.id,
    actor: me,
    action: "project.join_requested",
    target: selectedProject.id,
    detail: { teamId },
    req,
  });
  dispatch(
    "team.join_requested",
    { teamId, userId: me.userId, projectId: selectedProject.id },
    event.id
  );
  return {
    requestId: storedRequest?.id ?? requestId,
    status: "pending",
    alreadyRequested: false,
  };
});

const decisionBody = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});

export const PATCH = handle<P>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const { event, selectedProject } = await context(teamId);
  if (!(await canReview(event.id, me))) {
    throw forbidden("Seul un coach rattaché à l'événement peut traiter les demandes");
  }
  if (!innolabProjectFormationIsOpen(event)) {
    throw forbidden("Project registration is closed for this event");
  }

  const body = await readBody(req, decisionBody);
  const [request] = await db
    .select()
    .from(projectJoinRequest)
    .where(
      and(
        eq(projectJoinRequest.id, body.requestId),
        eq(projectJoinRequest.projectId, selectedProject.id)
      )
    )
    .limit(1);
  if (!request) throw notFound("Join request not found");
  if (request.status !== "pending") {
    throw conflict("This join request has already been reviewed");
  }

  const reviewedAt = new Date();
  if (body.decision === "reject") {
    await db
      .update(projectJoinRequest)
      .set({ status: "rejected", reviewedBy: me.userId, reviewedAt, updatedAt: reviewedAt })
      .where(eq(projectJoinRequest.id, request.id));
    await audit({
      eventId: event.id,
      actor: me,
      action: "project.join_rejected",
      target: selectedProject.id,
      detail: { requestId: request.id, userId: request.userId, teamId },
      req,
    });
    return { status: "rejected" };
  }

  const joined = await joinTeam(teamId, request.userId, {
    requireRegistration: true,
    requireLookingForMembers: true,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(projectJoinRequest)
      .set({ status: "approved", reviewedBy: me.userId, reviewedAt, updatedAt: reviewedAt })
      .where(eq(projectJoinRequest.id, request.id));
    await tx
      .update(projectJoinRequest)
      .set({ status: "cancelled", reviewedAt, updatedAt: reviewedAt })
      .where(
        and(
          eq(projectJoinRequest.eventId, event.id),
          eq(projectJoinRequest.userId, request.userId),
          eq(projectJoinRequest.status, "pending"),
          ne(projectJoinRequest.id, request.id)
        )
      );
  });
  await audit({
    eventId: event.id,
    actor: me,
    action: "project.join_approved",
    target: selectedProject.id,
    detail: { requestId: request.id, userId: request.userId, teamId },
    req,
  });
  dispatch(
    "team.joined",
    { teamId, userId: request.userId, projectId: selectedProject.id },
    event.id
  );
  return { status: "approved", alreadyMember: joined.alreadyMember };
});

export const DELETE = handle<P>(async (req, { id: teamId }) => {
  const me = await requireUser(req);
  const { event, selectedProject } = await context(teamId);
  const [request] = await db
    .select({ id: projectJoinRequest.id })
    .from(projectJoinRequest)
    .where(
      and(
        eq(projectJoinRequest.projectId, selectedProject.id),
        eq(projectJoinRequest.userId, me.userId),
        eq(projectJoinRequest.status, "pending")
      )
    )
    .limit(1);
  if (!request) throw notFound("Pending join request not found");

  const updatedAt = new Date();
  await db
    .update(projectJoinRequest)
    .set({ status: "cancelled", reviewedAt: updatedAt, updatedAt })
    .where(eq(projectJoinRequest.id, request.id));
  await audit({
    eventId: event.id,
    actor: me,
    action: "project.join_cancelled",
    target: selectedProject.id,
    detail: { requestId: request.id, teamId },
    req,
  });
  return { status: "cancelled" };
});
