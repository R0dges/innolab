import type { NextRequest } from "next/server";

import { handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";
import { currentParticipantContextFor } from "@/lib/server/people";

/** Participant-only context for the single active Innovation Lab dashboard. */
export const GET = handle(async (req: NextRequest) => {
  const me = await requireUser(req);
  return currentParticipantContextFor(me.userId);
});
