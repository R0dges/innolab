import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, project, registration, team, teamMember } from "@/lib/db";
import { id, secretToken } from "@/lib/ids";
import { innolabProjectFormationIsOpen } from "@/lib/innolab";
import { textToDoc } from "@/lib/rich-text";
import { audit } from "@/lib/server/audit";
import { teamOf } from "@/lib/server/events";
import { conflict, created, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { loadPitch } from "@/lib/server/pitches";
import { dispatch } from "@/lib/server/webhooks";

const input = z.object({
  teamName: z.string().trim().min(2).max(60),
  projectTitle: z.string().trim().min(1).max(100).optional(),
});

export const POST = handle<{ id: string }>(async (req, { id: pitchId }) => {
  const me = await requireUser(req);
  const { pitch: current, event } = await loadPitch(pitchId);
  if (current.authorId !== me.userId) {
    throw forbidden("Only the selected pitch author can start its project");
  }
  if (current.status !== "selected") throw forbidden("Only a selected pitch can become a project");
  if (!innolabProjectFormationIsOpen(event)) {
    throw forbidden("Team and project creation is not open for this event");
  }
  if (await teamOf(event.id, me.userId)) {
    throw conflict("You already belong to a team for this event");
  }
  const body = await readBody(req, input);
  const teamId = id.team();
  const projectId = id.project();

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${current.id}))`);
    const [existing] = await tx
      .select({ id: project.id })
      .from(project)
      .where(eq(project.pitchId, current.id))
      .limit(1);
    if (existing) throw conflict("This pitch already has a project");
    await tx.insert(team).values({
      id: teamId,
      eventId: event.id,
      name: body.teamName,
      lookingForMembers: true,
      inviteToken: secretToken(24),
    });
    await tx.insert(teamMember).values({ teamId, userId: me.userId, role: "owner" });
    await tx
      .insert(registration)
      .values({ eventId: event.id, userId: me.userId })
      .onConflictDoNothing();
    await tx.insert(project).values({
      id: projectId,
      eventId: event.id,
      teamId,
      pitchId: current.id,
      title: body.projectTitle ?? current.title,
      description: current.description,
      content: textToDoc(current.description),
      status: "draft",
    });
  });

  await audit({
    eventId: event.id,
    actor: me,
    action: "pitch.project_created",
    target: projectId,
    detail: { pitchId: current.id, teamId },
    req,
  });
  dispatch("team.created", { teamId, name: body.teamName }, event.id);
  return created({ id: projectId, teamId, pitchId: current.id });
});
