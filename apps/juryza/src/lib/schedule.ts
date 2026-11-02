export const SCHEDULE_KINDS = [
  "launch",
  "plenary",
  "workshop",
  "intergroup",
  "deadline",
  "deliverable",
  "final",
  "other",
] as const;

export const SCHEDULE_AUDIENCES = ["all", "participants", "coaches", "organizers"] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export type ScheduleAudience = (typeof SCHEDULE_AUDIENCES)[number];

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  launch: "Launch",
  plenary: "Plenary",
  workshop: "Workshop",
  intergroup: "Intergroup meeting",
  deadline: "Deadline",
  deliverable: "Deliverable",
  final: "Final presentation",
  other: "Other",
};

export const SCHEDULE_AUDIENCE_LABELS: Record<ScheduleAudience, string> = {
  all: "Everyone",
  participants: "Participants",
  coaches: "Coaches",
  organizers: "Organizers",
};

export interface ScheduleViewer {
  registered: boolean;
  isJudge: boolean;
  canManage: boolean;
}

/** Calendar audiences an event relationship is allowed to read. */
export function visibleScheduleAudiences(viewer: ScheduleViewer | null): ScheduleAudience[] {
  if (viewer?.canManage) return [...SCHEDULE_AUDIENCES];
  const audiences: ScheduleAudience[] = ["all"];
  if (viewer?.registered) audiences.push("participants");
  if (viewer?.isJudge) audiences.push("coaches");
  return audiences;
}

export function canAccessPersonalCalendar(viewer: ScheduleViewer | null): boolean {
  return Boolean(viewer?.registered || viewer?.isJudge || viewer?.canManage);
}
