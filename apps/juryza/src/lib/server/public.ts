import { connection } from "next/server";

import { and, desc, eq, sql } from "drizzle-orm";

import { db, event, eventJudge, project, registration, score, team, vote } from "@/lib/db";

/**
 * Read models for the public marketing pages. Only published events are ever
 * counted or listed. Each helper awaits `connection()` first so the page is
 * rendered per request — never prerendered at build time, when no database is
 * reachable.
 */

export interface PlatformStats {
  events: number;
  projects: number;
  participants: number;
  scores: number;
  judges: number;
  votes: number;
}

export async function platformStats(): Promise<PlatformStats> {
  await connection();
  const published = sql`(select ${event.id} from ${event} where ${event.visibility} = 'published')`;
  const [row] = await db
    .select({
      events: sql<number>`(select count(*)::int from ${event} where ${event.visibility} = 'published')`,
      projects: sql<number>`(select count(*)::int from ${project} where ${project.status} = 'submitted' and ${project.eventId} in ${published})`,
      participants: sql<number>`(select count(distinct ${registration.userId})::int from ${registration} where ${registration.eventId} in ${published})`,
      scores: sql<number>`(select count(*)::int from ${score} where ${score.eventId} in ${published})`,
      judges: sql<number>`(select count(distinct ${eventJudge.userId})::int from ${eventJudge} where ${eventJudge.eventId} in ${published})`,
      votes: sql<number>`(select count(*)::int from ${vote} where ${vote.eventId} in ${published})`,
    })
    .from(sql`(select 1) as one`);
  return row ?? { events: 0, projects: 0, participants: 0, scores: 0, judges: 0, votes: 0 };
}

export async function featuredEvents(limit = 3) {
  await connection();
  return db
    .select({
      id: event.id,
      slug: event.slug,
      name: event.name,
      tagline: event.tagline,
      hue: event.hue,
      mode: event.mode,
      location: event.location,
      submissionsOpen: event.submissionsOpen,
      submissionsClose: event.submissionsClose,
      judgingClose: event.judgingClose,
      votingOpen: event.votingOpen,
      votingClose: event.votingClose,
      resultsPublished: event.resultsPublished,
      projects: sql<number>`(select count(*)::int from ${project} where ${project.eventId} = ${event.id} and ${project.status} = 'submitted')`,
      participants: sql<number>`(select count(*)::int from ${registration} where ${registration.eventId} = ${event.id})`,
      teams: sql<number>`(select count(*)::int from ${team} where ${team.eventId} = ${event.id})`,
    })
    .from(event)
    .where(and(eq(event.visibility, "published"), eq(event.workflow, "innolab")))
    .orderBy(desc(event.submissionsClose))
    .limit(limit);
}

export type FeaturedEvent = Awaited<ReturnType<typeof featuredEvents>>[number];
