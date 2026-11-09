"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Phase } from "@/lib/phase";
import type {
  Announcement,
  Event,
  EventDocument,
  EventResource,
  Json,
  Prize,
  RubricCriterion,
  ScheduleItem,
  Track,
} from "@/lib/types";

/**
 * Shared queries and their cache keys. Pages under /e/<slug> and
 * /manage/<slug> read the event through `useEvent`, so a mutation anywhere can
 * refresh them all with `queryClient.invalidateQueries({ queryKey: eventKey(slug) })`.
 */

export type AnnouncementItem = Json<Announcement> & {
  authorName: string | null;
  authorImage: string | null;
};

export interface EventDetail {
  event: Json<Event>;
  tracks: Json<Track>[];
  prizes: Json<Prize>[];
  criteria: Json<RubricCriterion>[];
  judges: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    headline: string | null;
  }[];
  announcements: AnnouncementItem[];
  counts: { projects: number; participants: number; teams: number };
  viewer: null | {
    registered: boolean;
    team: { id: string; name: string; role: string } | null;
    isJudge: boolean;
    canManage: boolean;
  };
}

export interface DashboardIdea {
  id: string;
  title: string;
  description: string;
  status: string;
  author: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
  };
  votes: number | null;
}

export interface DashboardProject {
  pitchId: string;
  projectId: string | null;
  title: string;
  description: string;
  status: string | null;
  author: DashboardIdea["author"];
  joinState:
    | "available"
    | "joined"
    | "already-on-team"
    | "registration-required"
    | "sign-in-required"
    | "team-pending"
    | "requested"
    | "full"
    | "closed";
  team: {
    id: string;
    name: string | null;
    memberCount: number;
    capacity: number;
    lookingForMembers: boolean;
    registrationState: "open" | "full" | "closed";
  } | null;
}

export interface EventDashboard extends EventDetail {
  phase: Phase;
  ideas: DashboardIdea[];
  selectedProjects: DashboardProject[];
  audit: Json<EventDocument> | null;
  assistant: { url: string } | null;
  resources: Json<EventResource>[];
  schedule: Json<ScheduleItem>[];
  wallOfFame: null | {
    project: {
      id: string;
      title: string;
      tagline: string | null;
      thumbnailUrl: string | null;
      teamName: string | null;
    };
    members: {
      id: string;
      name: string;
      username: string | null;
      image: string | null;
      headline: string | null;
    }[];
  };
}

export const eventKey = (slug: string) => ["event", slug] as const;

export function useEvent(slug: string) {
  return useQuery({
    queryKey: eventKey(slug),
    queryFn: () => api.get<EventDetail>(`/api/events/${slug}`),
  });
}

export function useEventDashboard(slug: string) {
  return useQuery({
    queryKey: [...eventKey(slug), "dashboard"],
    queryFn: () => api.get<EventDashboard>(`/api/events/${slug}/dashboard`),
  });
}
