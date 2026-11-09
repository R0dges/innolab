import { and, desc, eq, sql } from "drizzle-orm";

import {
  assignment,
  certificate,
  db,
  event,
  eventJudge,
  project,
  registration,
  score,
  team,
  teamMember,
  track,
  user as userTable,
} from "@/lib/db";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";

/** Read models about a person: their dashboard and their public profile. */

export async function overviewFor(userId: string) {
  const [participating, projects, judging, organizing, certificates] = await Promise.all([
    db
      .select({
        id: event.id,
        slug: event.slug,
        name: event.name,
        tagline: event.tagline,
        hue: event.hue,
        submissionsOpen: event.submissionsOpen,
        submissionsClose: event.submissionsClose,
        votingOpen: event.votingOpen,
        votingClose: event.votingClose,
        judgingClose: event.judgingClose,
        resultsPublished: event.resultsPublished,
        teamId: sql<
          string | null
        >`(select ${team.id} from ${team} join ${teamMember} on ${teamMember.teamId} = ${team.id} where ${team.eventId} = ${event.id} and ${teamMember.userId} = ${userId} limit 1)`,
        teamName: sql<
          string | null
        >`(select ${team.name} from ${team} join ${teamMember} on ${teamMember.teamId} = ${team.id} where ${team.eventId} = ${event.id} and ${teamMember.userId} = ${userId} limit 1)`,
      })
      .from(registration)
      .innerJoin(event, eq(event.id, registration.eventId))
      .where(eq(registration.userId, userId))
      .orderBy(desc(event.submissionsClose)),
    db
      .select({
        id: project.id,
        title: project.title,
        tagline: project.tagline,
        status: project.status,
        thumbnailUrl: project.thumbnailUrl,
        updatedAt: project.updatedAt,
        eventSlug: event.slug,
        eventName: event.name,
        submissionsClose: event.submissionsClose,
        trackName: track.name,
        teamName: team.name,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(project, eq(project.teamId, team.id))
      .innerJoin(event, eq(event.id, project.eventId))
      .leftJoin(track, eq(track.id, project.trackId))
      .where(eq(teamMember.userId, userId))
      .orderBy(desc(project.updatedAt)),
    db
      .select({
        id: event.id,
        slug: event.slug,
        name: event.name,
        hue: event.hue,
        workflow: event.workflow,
        submissionsClose: event.submissionsClose,
        judgingOpen: event.judgingOpen,
        judgingClose: event.judgingClose,
        resultsPublished: event.resultsPublished,
        assigned: sql<number>`(select count(*)::int from ${assignment} where ${assignment.eventId} = ${event.id} and ${assignment.judgeId} = ${userId})`,
        scored: sql<number>`(select count(*)::int from ${score} where ${score.eventId} = ${event.id} and ${score.judgeId} = ${userId})`,
      })
      .from(eventJudge)
      .innerJoin(event, eq(event.id, eventJudge.eventId))
      .where(eq(eventJudge.userId, userId)),
    db
      .select({
        id: event.id,
        slug: event.slug,
        name: event.name,
        hue: event.hue,
        visibility: event.visibility,
        submissionsOpen: event.submissionsOpen,
        submissionsClose: event.submissionsClose,
        votingOpen: event.votingOpen,
        votingClose: event.votingClose,
        judgingClose: event.judgingClose,
        resultsPublished: event.resultsPublished,
        projects: sql<number>`(select count(*)::int from ${project} where ${project.eventId} = ${event.id} and ${project.status} = 'submitted')`,
        participants: sql<number>`(select count(*)::int from ${registration} where ${registration.eventId} = ${event.id})`,
      })
      .from(event)
      .where(eq(event.createdBy, userId))
      .orderBy(desc(event.submissionsClose)),
    db
      .select({
        serial: certificate.serial,
        kind: certificate.kind,
        statement: certificate.statement,
        issuedAt: certificate.issuedAt,
        eventName: event.name,
      })
      .from(certificate)
      .innerJoin(event, eq(event.id, certificate.eventId))
      .where(eq(certificate.subjectId, userId))
      .orderBy(desc(certificate.issuedAt)),
  ]);
  return {
    participating,
    projects: EVENT_TRACKS_ENABLED
      ? projects
      : projects.map((entry) => ({ ...entry, trackName: null })),
    judging,
    organizing,
    certificates,
  };
}

export async function publicProfile(username: string) {
  const q = username.toLowerCase().trim();
  const [u] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
      role: userTable.role,
      headline: userTable.headline,
      bio: userTable.bio,
      location: userTable.location,
      websiteUrl: userTable.websiteUrl,
      githubUrl: userTable.githubUrl,
      skills: userTable.skills,
      points: userTable.points,
      prizeUsd: userTable.prizeUsd,
      awardsCount: userTable.awardsCount,
      lookingForTeam: userTable.lookingForTeam,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(
      sql`${userTable.username} = ${q} or lower(${userTable.email}) = ${`${q}@raptors.community`} or lower(${userTable.githubUrl}) = ${`https://github.com/${q}`}`
    )
    .limit(1);
  if (!u) return null;

  // Compute platform rank if points exist
  let rank: number | null = null;
  if (u.points > 0) {
    const [rankRow] = await db
      .select({
        higherCount: sql<number>`count(*)::int`,
      })
      .from(userTable)
      .where(sql`${userTable.points} > ${u.points}`);
    rank = (rankRow?.higherCount ?? 0) + 1;
  }

  const [projects, judged, certificates, rawEvents] = await Promise.all([
    db
      .select({
        id: project.id,
        title: project.title,
        tagline: project.tagline,
        thumbnailUrl: project.thumbnailUrl,
        techTags: project.techTags,
        eventSlug: event.slug,
        eventName: event.name,
        teamName: team.name,
        submittedAt: project.submittedAt,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(project, eq(project.teamId, team.id))
      .innerJoin(event, eq(event.id, project.eventId))
      .where(
        and(
          eq(teamMember.userId, u.id),
          eq(project.status, "submitted"),
          eq(event.visibility, "published")
        )
      )
      .orderBy(desc(project.submittedAt)),
    db
      .select({ slug: event.slug, name: event.name })
      .from(eventJudge)
      .innerJoin(event, eq(event.id, eventJudge.eventId))
      .where(and(eq(eventJudge.userId, u.id), eq(event.visibility, "published"))),
    db
      .select({
        serial: certificate.serial,
        kind: certificate.kind,
        statement: certificate.statement,
        eventName: event.name,
        issuedAt: certificate.issuedAt,
      })
      .from(certificate)
      .innerJoin(event, eq(event.id, certificate.eventId))
      .where(eq(certificate.subjectId, u.id))
      .orderBy(desc(certificate.issuedAt)),
    db
      .select({
        id: event.id,
        slug: event.slug,
        name: event.name,
        hue: event.hue,
        tagline: event.tagline,
        submissionsClose: event.submissionsClose,
        teamName: team.name,
      })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .innerJoin(event, eq(event.id, team.eventId))
      .where(and(eq(teamMember.userId, u.id), eq(event.visibility, "published")))
      .orderBy(desc(event.submissionsClose)),
  ]);

  // Deduplicate participated events so each event appears once in history
  const eventMap = new Map<string, (typeof rawEvents)[number]>();
  for (const evt of rawEvents) {
    const existing = eventMap.get(evt.id);
    if (existing) {
      if (evt.teamName && !existing.teamName.includes(evt.teamName)) {
        existing.teamName = `${existing.teamName}, ${evt.teamName}`;
      }
    } else {
      eventMap.set(evt.id, { ...evt });
    }
  }
  const participatedEvents = Array.from(eventMap.values());

  return {
    user: { ...u, rank },
    projects,
    judged,
    certificates,
    participatedEvents,
  };
}
