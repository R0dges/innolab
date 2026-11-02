import { featuredEvents } from "@/lib/server/public";

import { LandingContent } from "./landing-content";

export default async function LandingPage() {
  const events = await featuredEvents(3);
  return (
    <LandingContent
      events={events.map((event) => ({
        id: event.id,
        slug: event.slug,
        name: event.name,
        tagline: event.tagline,
        hue: event.hue,
        submissionsOpen: event.submissionsOpen?.toISOString() ?? null,
        submissionsClose: event.submissionsClose.toISOString(),
        participants: event.participants,
        projects: event.projects,
      }))}
    />
  );
}

