export interface AnnouncementAudienceViewer {
  registered: boolean;
  isJudge: boolean;
  canManage: boolean;
}

/** Announcement audiences an event relationship is allowed to read. */
export function visibleAnnouncementAudiences(viewer: AnnouncementAudienceViewer | null): string[] {
  if (viewer?.canManage) return ["all", "participants", "coaches", "organizers"];
  const audiences = ["all"];
  if (viewer?.registered) audiences.push("participants");
  if (viewer?.isJudge) audiences.push("coaches");
  return audiences;
}
