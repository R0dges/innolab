import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { comment, db, project, team, track } from "@/lib/db";
import { id } from "@/lib/ids";
import { isInnolab } from "@/lib/innolab";
import { submissionsAreOpen } from "@/lib/phase";
import { docToText } from "@/lib/rich-text";
import { audit } from "@/lib/server/audit";
import { loadEvent, teamOf } from "@/lib/server/events";
import { conflict, created, forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser, resolveIdentity } from "@/lib/server/identity";
import { projectInput } from "@/lib/server/schemas";
import { dispatch } from "@/lib/server/webhooks";

type P = { event: string };

/**
 * GET  /api/events/:event/projects — the public gallery: submitted projects
 *      only, no auth. `?q=` searches title/tagline/write-up, `?track=` and
 *      `?tag=` filter, `?sort=newest|title`.
 * POST /api/events/:event/projects — start (or submit) your team's project.
 *      Refused with 403 once the submission deadline has passed — enforced here,
 *      whatever the UI shows. One project per team.
 */

export const GET = handle<P>(async (req, { event: ref }) => {
  const e = await loadEvent(ref, await resolveIdentity(req));
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const trackId = url.searchParams.get("track")?.trim();
  const tag = url.searchParams.get("tag")?.trim();
  const sort = url.searchParams.get("sort");

  const filters = [eq(project.eventId, e.id), eq(project.status, "submitted")];
  if (trackId) filters.push(eq(project.trackId, trackId));
  if (tag) filters.push(sql`${project.techTags} ? ${tag}`);
  if (q) {
    const like = `%${q}%`;
    const search = or(
      ilike(project.title, like),
      ilike(project.tagline, like),
      ilike(project.description, like)
    );
    if (search) filters.push(search);
  }

  const rows = await db
    .select({
      id: project.id,
      title: project.title,
      tagline: project.tagline,
      thumbnailUrl: project.thumbnailUrl,
      repoUrl: project.repoUrl,
      liveUrl: project.liveUrl,
      videoUrl: project.videoUrl,
      techTags: project.techTags,
      trackId: project.trackId,
      trackName: track.name,
      teamId: project.teamId,
      teamName: team.name,
      submittedAt: project.submittedAt,
      comments: sql<number>`(select count(*)::int from ${comment} where ${comment.projectId} = ${project.id})`,
    })
    .from(project)
    .leftJoin(track, eq(project.trackId, track.id))
    .leftJoin(team, eq(project.teamId, team.id))
    .where(and(...filters))
    .orderBy(sort === "title" ? project.title : desc(project.submittedAt))
    .limit(500);

  return { event: { id: e.id, slug: e.slug, name: e.name }, count: rows.length, projects: rows };
});

export const POST = handle<P>(async (req, { event: ref }) => {
  const me = await requireUser(req);
  const e = await loadEvent(ref, me);
  if (isInnolab(e)) {
    throw forbidden("Innolab projects must be created from a selected pitch");
  }

  // The deadline holds in the backend: no new projects once submissions close.
  if (!submissionsAreOpen(e)) {
    await audit({ eventId: e.id, actor: me, action: "submission.rejected.closed", req });
    throw forbidden("Submissions are closed for this event");
  }

  const myTeam = await teamOf(e.id, me.userId);
  if (!myTeam) throw forbidden("Create or join a team for this event before starting a project");

  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.teamId, myTeam.id))
    .limit(1);
  if (existing) throw conflict("Your team already has a project for this event");

  const b = await readBody(req, projectInput);
  const submit = b.submit === true;

  const projectId = id.project();
  await db.insert(project).values({
    id: projectId,
    eventId: e.id,
    teamId: myTeam.id,
    trackId: b.trackId ?? null,
    title: b.title,
    tagline: b.tagline ?? null,
    content: b.content ?? null,
    description: docToText(b.content),
    thumbnailUrl: b.thumbnailUrl,
    videoUrl: b.videoUrl,
    repoUrl: b.repoUrl,
    liveUrl: b.liveUrl,
    techTags: b.techTags ?? [],
    status: submit ? "submitted" : "draft",
    submittedAt: submit ? new Date() : null,
  });

  await audit({
    eventId: e.id,
    actor: me,
    action: submit ? "project.submitted" : "project.created",
    target: projectId,
    req,
  });
  if (submit) dispatch("project.submitted", { projectId, title: b.title }, e.id);
  return created({ id: projectId, status: submit ? "submitted" : "draft" });
});
