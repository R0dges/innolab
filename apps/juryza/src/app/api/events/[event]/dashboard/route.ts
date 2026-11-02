import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  db,
  event,
  eventDocument,
  eventJudge,
  eventResource,
  pitch,
  pitchVote,
  prize,
  project,
  projectJoinRequest,
  registration,
  rubricCriterion,
  scheduleItem,
  team,
  teamMember,
  track,
  user as userTable,
} from "@/lib/db";
import { innolabProjectFormationIsOpen, pitchVotingHasClosed } from "@/lib/innolab";
import { phaseOf } from "@/lib/phase";
import { visibleScheduleAudiences } from "@/lib/schedule";
import { announcementsForEvent } from "@/lib/server/announcements";
import { loadEvent, viewerForEvent } from "@/lib/server/events";
import { handle } from "@/lib/server/http";
import { resolveIdentity } from "@/lib/server/identity";

type P = { event: string };

/**
 * GET /api/events/:event/dashboard — one permission-aware operational read model.
 * Every operational section is filtered before it leaves the server.
 */
export const GET = handle<P>(async (req, { event: ref }) => {
  const me = await resolveIdentity(req);
  const e = await loadEvent(ref, me);
  const viewer = await viewerForEvent(e, me);
  const showPitchVotes = Boolean(viewer?.canManage || pitchVotingHasClosed(e));
  const canSeeOperationalData = Boolean(viewer?.registered || viewer?.isJudge || viewer?.canManage);
  const canCoach = Boolean(viewer?.isJudge || viewer?.canManage);
  const canSeeSubmittedPitches = Boolean(
    canCoach || (viewer?.registered && e.pitchPresentationOpenedAt)
  );
  const projectRegistrationIsOpen = innolabProjectFormationIsOpen(e);

  const [
    tracks,
    prizes,
    criteria,
    judges,
    announcements,
    [counts],
    ideas,
    myJoinRequests,
    auditDocuments,
    resources,
    schedule,
  ] = await Promise.all([
    db.select().from(track).where(eq(track.eventId, e.id)).orderBy(asc(track.position)),
    db
      .select()
      .from(prize)
      .where(eq(prize.eventId, e.id))
      .orderBy(asc(prize.kind), asc(prize.rank)),
    db
      .select()
      .from(rubricCriterion)
      .where(eq(rubricCriterion.eventId, e.id))
      .orderBy(asc(rubricCriterion.position)),
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        username: userTable.username,
        image: userTable.image,
        headline: userTable.headline,
      })
      .from(eventJudge)
      .innerJoin(userTable, eq(userTable.id, eventJudge.userId))
      .where(eq(eventJudge.eventId, e.id))
      .orderBy(asc(userTable.name)),
    announcementsForEvent(e.id, viewer, 8),
    db
      .select({
        projects: sql<number>`(select count(*)::int from ${project} where ${project.eventId} = ${e.id} and ${project.status} = 'submitted')`,
        participants: sql<number>`(select count(*)::int from ${registration} where ${registration.eventId} = ${e.id})`,
        teams: sql<number>`(select count(*)::int from ${team} where ${team.eventId} = ${e.id})`,
      })
      .from(event)
      .where(eq(event.id, e.id)),
    db
      .select({
        id: pitch.id,
        title: pitch.title,
        description: pitch.description,
        status: pitch.status,
        authorId: pitch.authorId,
        authorName: userTable.name,
        authorUsername: userTable.username,
        authorImage: userTable.image,
        votes: sql<number>`(select count(*)::int from ${pitchVote} where ${pitchVote.pitchId} = ${pitch.id})`,
        projectId: project.id,
        projectTitle: project.title,
        projectStatus: project.status,
        teamId: team.id,
        teamName: team.name,
        lookingForMembers: team.lookingForMembers,
        memberCount: sql<number>`(select count(*)::int from ${teamMember} where ${teamMember.teamId} = ${team.id})`,
      })
      .from(pitch)
      .innerJoin(userTable, eq(userTable.id, pitch.authorId))
      .leftJoin(project, eq(project.pitchId, pitch.id))
      .leftJoin(team, eq(team.id, project.teamId))
      .where(and(eq(pitch.eventId, e.id), inArray(pitch.status, ["submitted", "selected"])))
      .orderBy(asc(pitch.createdAt)),
    me
      ? db
          .select({ projectId: projectJoinRequest.projectId })
          .from(projectJoinRequest)
          .where(
            and(
              eq(projectJoinRequest.eventId, e.id),
              eq(projectJoinRequest.userId, me.userId),
              eq(projectJoinRequest.status, "pending")
            )
          )
      : Promise.resolve([]),
    canSeeOperationalData
      ? db
          .select()
          .from(eventDocument)
          .where(
            and(
              eq(eventDocument.eventId, e.id),
              eq(eventDocument.kind, "audit"),
              eq(eventDocument.isCurrent, true)
            )
          )
          .orderBy(desc(eventDocument.version))
          .limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(scheduleItem)
      .where(
        and(
          eq(scheduleItem.eventId, e.id),
          eq(scheduleItem.status, "scheduled"),
          inArray(scheduleItem.audience, visibleScheduleAudiences(viewer))
        )
      )
      .orderBy(asc(scheduleItem.startsAt), asc(scheduleItem.endsAt), asc(scheduleItem.title)),
    canSeeOperationalData
      ? db
          .select()
          .from(eventResource)
          .where(eq(eventResource.eventId, e.id))
          .orderBy(
            sql`case ${eventResource.kind} when 'scope' then 0 when 'accessible' then 1 else 2 end`,
            asc(eventResource.position),
            asc(eventResource.name)
          )
      : Promise.resolve([]),
  ]);

  const pendingProjectIds = new Set(myJoinRequests.map((request) => request.projectId));

  return {
    event: e,
    viewer,
    phase: phaseOf(e),
    tracks,
    prizes,
    criteria,
    judges,
    announcements,
    counts,
    ideas: ideas
      .filter((idea) => canSeeSubmittedPitches || idea.authorId === me?.userId)
      .map((idea) => ({
        id: idea.id,
        title: idea.title,
        description: idea.description,
        status: idea.status,
        author: {
          id: idea.authorId,
          name: idea.authorName,
          username: idea.authorUsername,
          image: idea.authorImage,
        },
        votes: showPitchVotes ? idea.votes : null,
      })),
    selectedProjects: ideas
      .filter((idea) => idea.status === "selected")
      .map((idea) => {
        const projectIsPublic = idea.projectStatus === "submitted";
        const canSeeProject = canSeeOperationalData || projectIsPublic;
        const joinState = !viewer
          ? "sign-in-required"
          : !viewer.registered
            ? "registration-required"
            : !idea.teamId
              ? "team-pending"
              : viewer.team?.id === idea.teamId
                ? "joined"
                : viewer.team
                  ? "already-on-team"
                  : idea.projectId && pendingProjectIds.has(idea.projectId)
                    ? "requested"
                  : !projectRegistrationIsOpen || !idea.lookingForMembers
                    ? "closed"
                    : idea.memberCount >= e.maxTeamSize
                      ? "full"
                      : "available";
        return {
          pitchId: idea.id,
          projectId: canSeeProject ? idea.projectId : null,
          title: canSeeProject && idea.projectTitle ? idea.projectTitle : idea.title,
          description: idea.description,
          status: canSeeProject ? idea.projectStatus : null,
          author: {
            id: idea.authorId,
            name: idea.authorName,
            username: idea.authorUsername,
            image: idea.authorImage,
          },
          joinState,
          team:
            canSeeOperationalData && idea.teamId
              ? {
                  id: idea.teamId,
                  name: idea.teamName,
                  memberCount: idea.memberCount,
                  capacity: e.maxTeamSize,
                  lookingForMembers: Boolean(idea.lookingForMembers),
                  registrationState:
                    idea.memberCount >= e.maxTeamSize
                      ? "full"
                      : projectRegistrationIsOpen && idea.lookingForMembers
                        ? "open"
                        : "closed",
                }
              : null,
        };
      }),
    audit: auditDocuments[0] ?? null,
    resources,
    schedule,
  };
});
