import { and, eq } from "drizzle-orm";

import { db, event, eventJudge, pitch, registration } from "@/lib/db";
import { isInnolab } from "@/lib/innolab";
import { canManage } from "@/lib/server/events";
import { notFound } from "@/lib/server/http";
import type { Identity } from "@/lib/server/identity";

export async function loadPitch(pitchId: string) {
  const [row] = await db
    .select({ pitch, event })
    .from(pitch)
    .innerJoin(event, eq(event.id, pitch.eventId))
    .where(eq(pitch.id, pitchId))
    .limit(1);
  if (!row || !isInnolab(row.event)) throw notFound("Pitch not found");
  return row;
}

export async function pitchVoteRights(
  eventId: string,
  me: Identity | null,
  createdBy: string | null
) {
  if (!me) return { registered: false, panelJudge: false, manager: false, canVote: false };
  const [[registered], [panelJudge]] = await Promise.all([
    db
      .select({ userId: registration.userId })
      .from(registration)
      .where(and(eq(registration.eventId, eventId), eq(registration.userId, me.userId)))
      .limit(1),
    db
      .select({ userId: eventJudge.userId })
      .from(eventJudge)
      .where(and(eq(eventJudge.eventId, eventId), eq(eventJudge.userId, me.userId)))
      .limit(1),
  ]);
  const manager = canManage(me, { createdBy });
  return {
    registered: Boolean(registered),
    panelJudge: Boolean(panelJudge),
    manager,
    canVote: Boolean(registered || panelJudge || manager),
  };
}
