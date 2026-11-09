import { cache } from "react";
import { headers } from "next/headers";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { apiToken, db, user as userTable } from "@/lib/db";
import { hasAtLeast, type Role } from "@/lib/roles";
import { auth } from "@/lib/server/auth";
import { forbidden, unauthorized } from "@/lib/server/http";

/**
 * Request → identity. The single place a caller's role is established.
 *
 * Two credentials, in priority order:
 *  1. `Authorization: Bearer <token>` — a personal API token (stored as a
 *     SHA-256 hash). Used by the acceptance checker and by API clients.
 *  2. The Better Auth session cookie — the app's own pages.
 *
 * Authorization is enforced by the routes that call this, never by hiding UI.
 */

export interface Identity {
  userId: string;
  role: Role;
  email: string;
  name: string;
  username: string | null;
  image: string | null;
  location: string | null;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const identityColumns = {
  userId: userTable.id,
  role: userTable.role,
  email: userTable.email,
  name: userTable.name,
  username: userTable.username,
  image: userTable.image,
  location: userTable.location,
  banned: userTable.banned,
};

async function fromHeaders(h: Headers): Promise<Identity | null> {
  const authHeader = h.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const tokenHash = hashToken(authHeader.slice(7).trim());
    const [row] = await db
      .select(identityColumns)
      .from(apiToken)
      .innerJoin(userTable, eq(apiToken.userId, userTable.id))
      .where(eq(apiToken.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.banned) return null;
    void db
      .update(apiToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiToken.tokenHash, tokenHash))
      .catch(() => {});
    const { banned: _banned, ...identity } = row;
    return { ...identity, role: identity.role as Role };
  }

  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) return null;
  // Re-read the row so profile edits and role changes apply immediately.
  const [row] = await db
    .select(identityColumns)
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);
  if (!row || row.banned) return null;
  const { banned: _banned, ...identity } = row;
  return { ...identity, role: identity.role as Role };
}

/** Identity for an API request, or null for an anonymous visitor. */
export function resolveIdentity(req: Request): Promise<Identity | null> {
  return fromHeaders(req.headers);
}

/** Identity for the current server-component render (deduped per request). */
export const getViewer = cache(async (): Promise<Identity | null> => fromHeaders(await headers()));

export async function requireUser(req: Request): Promise<Identity> {
  const me = await resolveIdentity(req);
  if (!me) throw unauthorized();
  return me;
}

export async function requireRole(req: Request, min: Role): Promise<Identity> {
  const me = await requireUser(req);
  if (!hasAtLeast(me.role, min)) throw forbidden(`Requires the ${min} role`);
  return me;
}
