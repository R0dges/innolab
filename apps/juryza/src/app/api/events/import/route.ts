import type { NextRequest } from "next/server";

import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { audit } from "@/lib/server/audit";
import { bundleSchema, importBundle } from "@/lib/server/bundle";
import { badRequest, created, handle, readBody } from "@/lib/server/http";
import { requireRole } from "@/lib/server/identity";

/**
 * POST /api/events/import — create a new event from a bundle: a Juryza export
 * or any file in the DOGFOOD fixtures shape. The event is created as a draft
 * owned by the caller; ids collide-safely, people are matched by email. The
 * response reports what was created and anything skipped.
 */
export const POST = handle(async (req: NextRequest) => {
  const me = await requireRole(req, "organizer");
  const bundle = await readBody(req, bundleSchema);
  const containsTracks =
    bundle.tracks.length > 0 ||
    bundle.prizes.some((entry) => entry.kind === "track" || Boolean(entry.track)) ||
    bundle.judges.some((judge) => judge.tracks.length > 0) ||
    bundle.projects.some((project) => Boolean(project.track));
  if (!EVENT_TRACKS_ENABLED && containsTracks) {
    throw badRequest("Les axes sont désactivés. Retirez les axes du fichier avant de l’importer.");
  }
  const report = await importBundle(bundle, { createdBy: me.userId, visibility: "draft" });
  await audit({
    eventId: report.eventId,
    actor: me,
    action: "event.imported",
    detail: report.created,
    req,
  });
  return created(report);
});
