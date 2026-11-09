import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, platformSetting } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { forbidden, handle, readBody } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

const KEY = "archive-results-visibility";
const scope = z.enum(["all-active", "same-location", "event-participants"]);

async function requireAdmin(req: Request) {
  const me = await requireUser(req);
  if (me.role !== "admin") throw forbidden("Cette politique est réservée aux administrateurs");
  return me;
}

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const [setting] = await db
    .select()
    .from(platformSetting)
    .where(eq(platformSetting.key, KEY))
    .limit(1);
  return { scope: scope.catch("all-active").parse(setting?.value) };
});

export const PUT = handle(async (req) => {
  const me = await requireAdmin(req);
  const body = await readBody(req, z.object({ scope }));
  const updatedAt = new Date();
  await db
    .insert(platformSetting)
    .values({ key: KEY, value: body.scope, updatedBy: me.userId, updatedAt })
    .onConflictDoUpdate({
      target: platformSetting.key,
      set: { value: body.scope, updatedBy: me.userId, updatedAt },
    });
  await audit({
    actor: me,
    action: "platform.archive_visibility.updated",
    target: KEY,
    detail: { scope: body.scope, retroactive: true },
    req,
  });
  return { scope: body.scope, retroactive: true };
});
