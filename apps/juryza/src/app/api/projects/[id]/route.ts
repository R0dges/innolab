import type { NextRequest } from "next/server";

import { and, eq } from "drizzle-orm";

import type { Event, Project } from "@/lib/db";
import {
  db,
  event,
  project,
  registration,
  team,
  teamMember,
  track,
  user as userTable,
} from "@/lib/db";
import { submissionsAreOpen } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { docToText } from "@/lib/rich-text";
import { audit } from "@/lib/server/audit";
import { isEventCoach } from "@/lib/server/events";
import { badRequest, forbidden, handle, notFound, readBody } from "@/lib/server/http";
import type { Identity } from "@/lib/server/identity";
import { requireUser } from "@/lib/server/identity";
import { projectInput } from "@/lib/server/schemas";
import { dispatch } from "@/lib/server/webhooks";

type P = { id: string };

/**
 * GET    /api/projects/:id — a project with its team and track. Submitted
 *        projects are public; drafts are visible to the team and organizers.
 * PATCH  /api/projects/:id — edit (team members, until the deadline; the
 *        event's organizers at any time). Only the fields sent are changed.
 *        `submit: true` submits, `submit: false` withdraws back to draft.
 * DELETE /api/projects/:id — delete a draft or withdraw a submission (team
 *        owner before the deadline, or an organizer).
 */

async function load(projectId: string) {
  const [row] = await db
    .select({ project, event })
    .from(project)
    .innerJoin(event, eq(event.id, project.eventId))
    .where(eq(project.id, projectId))
    .limit(1);
  if (!row) throw notFound("Project not found");
  return row;
}

async function membership(me: Identity | null, p: Project) {
  if (!me || !p.teamId) return null;
  const [m] = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, p.teamId), eq(teamMember.userId, me.userId)))
    .limit(1);
  return m?.role ?? null;
}

async function editRights(me: Identity | null, p: Project, e: Event) {
  const manager = Boolean(me && (me.role === "admin" || (await isEventCoach(e.id, me.userId))));
  const role = await membership(me, p);
  return {
    manager,
    member: role !== null,
    owner: role === "owner",
    canEdit: manager || (role !== null && submissionsAreOpen(e)),
  };
}

export const GET = handle<P>(async (req: NextRequest, { id: projectId }) => {
  const me = await requireUser(req);
  const { project: p, event: e } = await load(projectId);
  const rights = await editRights(me, p, e);
  const [registered] = await db
    .select({ userId: registration.userId })
    .from(registration)
    .where(and(eq(registration.eventId, e.id), eq(registration.userId, me.userId)))
    .limit(1);
  if (!registered && !rights.member && !rights.manager) {
    throw notFound("Project not found");
  }
  if (p.status !== "submitted" && !rights.member && !rights.manager) {
    throw notFound("Project not found");
  }

  const [members, [trackRow], [teamRow]] = await Promise.all([
    p.teamId
      ? db
          .select({
            id: userTable.id,
            name: userTable.name,
            username: userTable.username,
            image: userTable.image,
            headline: userTable.headline,
            role: teamMember.role,
          })
          .from(teamMember)
          .innerJoin(userTable, eq(userTable.id, teamMember.userId))
          .where(eq(teamMember.teamId, p.teamId))
      : Promise.resolve([]),
    EVENT_TRACKS_ENABLED && p.trackId
      ? db.select().from(track).where(eq(track.id, p.trackId))
      : Promise.resolve([]),
    p.teamId
      ? db.select({ id: team.id, name: team.name }).from(team).where(eq(team.id, p.teamId))
      : Promise.resolve([]),
  ]);

  return {
    project: EVENT_TRACKS_ENABLED ? p : { ...p, trackId: null },
    event: {
      id: e.id,
      slug: e.slug,
      name: e.name,
      submissionsClose: e.submissionsClose,
      hue: e.hue,
    },
    track: trackRow ?? null,
    team: teamRow
      ? {
          id: teamRow.id,
          name: p.title,
          members: members.map((member) => ({
            ...member,
            name: member.name
              ? `${member.name.split(/\s+/)[0]} ${member.name.split(/\s+/).at(-1)?.[0] ?? ""}.`.trim()
              : "Participant",
          })),
        }
      : null,
    viewer: { ...rights, submissionsOpen: submissionsAreOpen(e) },
  };
});

export const PATCH = handle<P>(async (req, { id: projectId }) => {
  const me = await requireUser(req);
  const { project: p, event: e } = await load(projectId);
  const rights = await editRights(me, p, e);
  if (!rights.member && !rights.manager) throw forbidden("This is not your project");
  if (!rights.canEdit)
    throw forbidden("Submissions are closed; this project can no longer be edited");

  const raw = (await req
    .clone()
    .json()
    .catch(() => ({}))) as Record<string, unknown>;
  const b = await readBody(req, projectInput.partial());
  const sent = (k: string) => Object.hasOwn(raw, k);
  if (!EVENT_TRACKS_ENABLED && sent("trackId") && b.trackId) {
    throw badRequest("Les axes sont désactivés");
  }

  const patch: Partial<Project> = { updatedAt: new Date() };
  if (sent("title") && b.title) patch.title = b.title;
  if (sent("tagline")) patch.tagline = b.tagline ?? null;
  if (sent("trackId")) patch.trackId = EVENT_TRACKS_ENABLED ? (b.trackId ?? null) : null;
  if (sent("content")) {
    patch.content = b.content ?? null;
    patch.description = docToText(b.content);
  }
  for (const k of ["thumbnailUrl", "videoUrl", "repoUrl", "liveUrl"] as const) {
    if (sent(k)) patch[k] = b[k] ?? null;
  }
  if (sent("techTags")) patch.techTags = b.techTags ?? [];
  if (b.submit === true) {
    patch.status = "submitted";
    patch.submittedAt = p.submittedAt ?? new Date();
  } else if (b.submit === false) {
    patch.status = "draft";
    patch.submittedAt = null;
  }

  await db.update(project).set(patch).where(eq(project.id, p.id));
  const action =
    b.submit === true && p.status !== "submitted"
      ? "project.submitted"
      : b.submit === false
        ? "project.withdrawn"
        : "project.updated";
  await audit({ eventId: e.id, actor: me, action, target: p.id, req });
  dispatch(
    action === "project.submitted" ? "project.submitted" : "project.updated",
    { projectId: p.id },
    e.id
  );

  const [updated] = await db.select().from(project).where(eq(project.id, p.id));
  return { project: updated };
});

export const DELETE = handle<P>(async (req, { id: projectId }) => {
  const me = await requireUser(req);
  const { project: p, event: e } = await load(projectId);
  const rights = await editRights(me, p, e);
  if (!rights.manager && !(rights.owner && submissionsAreOpen(e))) {
    throw forbidden("Only the team owner can delete a project, and only before the deadline");
  }
  await db.delete(project).where(eq(project.id, p.id));
  await audit({
    eventId: e.id,
    actor: me,
    action: "project.deleted",
    target: p.id,
    detail: { title: p.title },
    req,
  });
  return { ok: true };
});
