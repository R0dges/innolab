import { and, eq, isNull, or } from "drizzle-orm";

import { db, webhook, webhookDelivery } from "@/lib/db";
import { id } from "@/lib/ids";
import { hmac } from "@/lib/server/signing";

/**
 * Webhook dispatch (T4).
 *
 * `dispatch(type, payload, eventId)` POSTs a signed JSON body to every active
 * subscription for that event (or platform-wide subscriptions) that wants the
 * type, and records each attempt. Fire-and-forget: a slow or dead receiver never
 * blocks the action that triggered it.
 *
 * Receivers verify `X-Juryza-Signature: sha256=<hex>` — an HMAC-SHA256 of the
 * raw body keyed with the subscription's own secret.
 */

export const WEBHOOK_EVENTS = [
  "event.created",
  "event.updated",
  "team.created",
  "team.join_requested",
  "team.joined",
  "project.submitted",
  "project.updated",
  "judge.invited",
  "judge.joined",
  "assignments.generated",
  "score.saved",
  "vote.cast",
  "comment.posted",
  "results.published",
  "certificate.issued",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export async function deliver(
  hook: { id: string; url: string; secret: string },
  type: string,
  payload: Record<string, unknown>
) {
  const body = JSON.stringify({ type, sentAt: new Date().toISOString(), data: payload });
  let status: number | null = null;
  let ok = false;
  let error: string | null = null;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Juryza-Webhooks/1.0",
        "X-Juryza-Event": type,
        "X-Juryza-Signature": `sha256=${hmac(body, hook.secret)}`,
      },
      body,
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    status = res.status;
    ok = res.ok;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  await db
    .insert(webhookDelivery)
    .values({ id: id.delivery(), webhookId: hook.id, eventType: type, payload, status, ok, error })
    .catch(() => {});
  return { status, ok, error };
}

export function dispatch(
  type: WebhookEventType,
  payload: Record<string, unknown>,
  eventId?: string | null
): void {
  void (async () => {
    const hooks = await db
      .select()
      .from(webhook)
      .where(
        and(
          eq(webhook.active, true),
          eventId
            ? or(eq(webhook.eventId, eventId), isNull(webhook.eventId))
            : isNull(webhook.eventId)
        )
      );
    await Promise.all(
      hooks
        .filter((h) => h.events.length === 0 || h.events.includes(type))
        .map((h) => deliver(h, type, { eventId, ...payload }))
    );
  })().catch((err) => console.error("[webhooks] dispatch failed", type, err));
}
