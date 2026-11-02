import type { NextRequest } from "next/server";

import { and, desc, eq, inArray, ne } from "drizzle-orm";

import {
  announcement,
  assignment,
  certificate,
  comment,
  db,
  event,
  eventJudge,
  project,
  registration,
  team,
  teamMember,
  user as userTable,
  vote,
} from "@/lib/db";
import { docToText, parseRichDoc } from "@/lib/rich-text";
import { handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

export interface NotificationItem {
  id: string;
  type: "team" | "announcement" | "deadline" | "vote" | "comment" | "certificate" | "assignment";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  badge?: string;
}

/**
 * GET /api/me/notifications — unified real-time notifications for the caller:
 * team joiners, announcements, upcoming/past deadlines, project votes & comments,
 * issued certificates, and judge review assignments.
 */
export const GET = handle(async (req: NextRequest) => {
  const me = await requireUser(req);
  const now = Date.now();

  // 1. Teams the user belongs to
  const myTeams = await db
    .select({
      teamId: teamMember.teamId,
      teamName: team.name,
      eventId: team.eventId,
      eventName: event.name,
    })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .innerJoin(event, eq(event.id, team.eventId))
    .where(eq(teamMember.userId, me.userId));

  const myTeamIds = myTeams.map((t) => t.teamId);

  // 2. Events the user is involved in (registered, judging, or organizing)
  const [regs, judgePanels, organized] = await Promise.all([
    db
      .select({
        eventId: registration.eventId,
        eventName: event.name,
        eventSlug: event.slug,
        submissionsClose: event.submissionsClose,
        judgingClose: event.judgingClose,
      })
      .from(registration)
      .innerJoin(event, eq(event.id, registration.eventId))
      .where(eq(registration.userId, me.userId)),
    db
      .select({
        eventId: eventJudge.eventId,
        eventName: event.name,
        eventSlug: event.slug,
        submissionsClose: event.submissionsClose,
        judgingClose: event.judgingClose,
      })
      .from(eventJudge)
      .innerJoin(event, eq(event.id, eventJudge.eventId))
      .where(eq(eventJudge.userId, me.userId)),
    db
      .select({
        eventId: event.id,
        eventName: event.name,
        eventSlug: event.slug,
        submissionsClose: event.submissionsClose,
        judgingClose: event.judgingClose,
      })
      .from(event)
      .where(eq(event.createdBy, me.userId)),
  ]);

  const allEventsMap = new Map<
    string,
    {
      eventId: string;
      eventName: string;
      eventSlug: string;
      submissionsClose: Date;
      judgingClose: Date | null;
    }
  >();
  for (const e of [...regs, ...judgePanels, ...organized]) {
    if (!allEventsMap.has(e.eventId)) allEventsMap.set(e.eventId, e);
  }
  const registeredEventIds = new Set(regs.map((row) => row.eventId));
  const coachedEventIds = new Set(judgePanels.map((row) => row.eventId));
  const organizedEventIds = new Set(organized.map((row) => row.eventId));
  const myEventIds = [...allEventsMap.keys()];

  // 3. User's projects
  const myProjects = myTeamIds.length
    ? await db
        .select({
          projectId: project.id,
          projectTitle: project.title,
          eventName: event.name,
        })
        .from(project)
        .innerJoin(event, eq(event.id, project.eventId))
        .where(inArray(project.teamId, myTeamIds))
    : [];

  const myProjectIds = myProjects.map((p) => p.projectId);
  const projectMap = new Map(myProjects.map((p) => [p.projectId, p]));

  // Parallel fetch of notifications
  const [teamJoiners, announcements, projectComments, projectVotes, certs, judgeAssignments] =
    await Promise.all([
      // Team members who joined user's teams
      myTeamIds.length
        ? db
            .select({
              teamId: teamMember.teamId,
              teamName: team.name,
              eventId: team.eventId,
              eventName: event.name,
              userId: userTable.id,
              userName: userTable.name,
              joinedAt: teamMember.joinedAt,
            })
            .from(teamMember)
            .innerJoin(team, eq(team.id, teamMember.teamId))
            .innerJoin(event, eq(event.id, team.eventId))
            .innerJoin(userTable, eq(userTable.id, teamMember.userId))
            .where(and(inArray(teamMember.teamId, myTeamIds), ne(teamMember.userId, me.userId)))
            .orderBy(desc(teamMember.joinedAt))
            .limit(10)
        : [],

      // Announcements from events
      myEventIds.length
        ? db
            .select({
              id: announcement.id,
              eventId: announcement.eventId,
              eventName: event.name,
              eventSlug: event.slug,
              title: announcement.title,
              body: announcement.body,
              priority: announcement.priority,
              audience: announcement.audience,
              pinned: announcement.pinned,
              createdAt: announcement.createdAt,
            })
            .from(announcement)
            .innerJoin(event, eq(event.id, announcement.eventId))
            .where(inArray(announcement.eventId, myEventIds))
            .orderBy(desc(announcement.createdAt))
            .limit(15)
        : [],

      // Comments on user's projects
      myProjectIds.length
        ? db
            .select({
              id: comment.id,
              projectId: comment.projectId,
              authorName: comment.authorName,
              body: comment.body,
              createdAt: comment.createdAt,
            })
            .from(comment)
            .where(and(inArray(comment.projectId, myProjectIds), ne(comment.authorId, me.userId)))
            .orderBy(desc(comment.createdAt))
            .limit(10)
        : [],

      // Votes on user's projects
      myProjectIds.length
        ? db
            .select({
              id: vote.id,
              projectId: vote.projectId,
              votes: vote.votes,
              createdAt: vote.createdAt,
            })
            .from(vote)
            .where(inArray(vote.projectId, myProjectIds))
            .orderBy(desc(vote.createdAt))
            .limit(15)
        : [],

      // Certificates for user
      db
        .select({
          serial: certificate.serial,
          statement: certificate.statement,
          eventName: event.name,
          issuedAt: certificate.issuedAt,
        })
        .from(certificate)
        .innerJoin(event, eq(event.id, certificate.eventId))
        .where(eq(certificate.subjectId, me.userId))
        .orderBy(desc(certificate.issuedAt))
        .limit(5),

      // Judge assignments
      db
        .select({
          id: assignment.id,
          projectId: assignment.projectId,
          projectTitle: project.title,
          eventName: event.name,
          eventSlug: event.slug,
          createdAt: assignment.createdAt,
        })
        .from(assignment)
        .innerJoin(project, eq(project.id, assignment.projectId))
        .innerJoin(event, eq(event.id, assignment.eventId))
        .where(eq(assignment.judgeId, me.userId))
        .orderBy(desc(assignment.createdAt))
        .limit(10),
    ]);

  const items: NotificationItem[] = [];

  // Format team joiners
  for (const tj of teamJoiners) {
    items.push({
      id: `tm_${tj.teamId}_${tj.userId}`,
      type: "team",
      title: `${tj.userName} joined your team`,
      message: `Joined "${tj.teamName}" for ${tj.eventName}.`,
      href: `/teams/${tj.teamId}`,
      createdAt: tj.joinedAt.toISOString(),
      badge: "Team",
    });
  }

  // Format announcements
  for (const a of announcements) {
    const allowed =
      a.audience === "all" ||
      (a.audience === "participants" && registeredEventIds.has(a.eventId)) ||
      (a.audience === "coaches" && coachedEventIds.has(a.eventId)) ||
      (a.audience === "organizers" && organizedEventIds.has(a.eventId));
    if (!allowed) continue;
    const preview = docToText(parseRichDoc(a.body), 120);
    items.push({
      id: `ann_${a.id}`,
      type: "announcement",
      title: `${a.eventName}: ${a.title}`,
      message: preview || "An announcement was posted.",
      href: `/e/${a.eventSlug}`,
      createdAt: a.createdAt.toISOString(),
      badge: a.priority === "urgent" ? "Urgent" : a.pinned ? "Pinned" : "Announcement",
    });
  }

  // Format deadline alerts (upcoming in 48 hours or recently closed in 24 hours)
  for (const e of allEventsMap.values()) {
    if (e.submissionsClose) {
      const closeTime = new Date(e.submissionsClose).getTime();
      const diff = closeTime - now;
      if (diff > 0 && diff <= 48 * 3600 * 1000) {
        const hours = Math.round(diff / 3600000);
        items.push({
          id: `deadline_close_${e.eventId}`,
          type: "deadline",
          title: `Submission deadline in ${hours}h: ${e.eventName}`,
          message: "Submissions will lock soon. Ensure your project is submitted!",
          href: `/e/${e.eventSlug}`,
          createdAt: new Date(now - 1000).toISOString(),
          badge: "Urgent",
        });
      }
    }
  }

  // Format comments
  for (const c of projectComments) {
    const prj = projectMap.get(c.projectId);
    items.push({
      id: `cmt_${c.id}`,
      type: "comment",
      title: `New comment on ${prj?.projectTitle ?? "your project"}`,
      message: `${c.authorName || "Someone"}: "${c.body.slice(0, 100)}"`,
      href: `/projects/${c.projectId}`,
      createdAt: c.createdAt.toISOString(),
      badge: "Comment",
    });
  }

  // Format votes
  for (const v of projectVotes) {
    const prj = projectMap.get(v.projectId);
    items.push({
      id: `vote_${v.id}`,
      type: "vote",
      title: `Vote on ${prj?.projectTitle ?? "your project"}`,
      message: `A community member allocated ${v.votes} vote${v.votes === 1 ? "" : "s"} to ${prj?.projectTitle ?? "your project"}.`,
      href: `/projects/${v.projectId}`,
      createdAt: v.createdAt.toISOString(),
      badge: "Vote",
    });
  }

  // Format certificates
  for (const cert of certs) {
    items.push({
      id: `cert_${cert.serial}`,
      type: "certificate",
      title: `Certificate awarded!`,
      message: `${cert.statement} (${cert.eventName}).`,
      href: `/settings/profile`,
      createdAt: cert.issuedAt.toISOString(),
      badge: "Certificate",
    });
  }

  // Format judge assignments
  for (const asg of judgeAssignments) {
    items.push({
      id: `asg_${asg.id}`,
      type: "assignment",
      title: `Project assigned: ${asg.projectTitle}`,
      message: `Assigned for your review in ${asg.eventName}.`,
      href: `/judging/${asg.eventSlug}`,
      createdAt: asg.createdAt.toISOString(),
      badge: "Judging",
    });
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { notifications: items };
});
