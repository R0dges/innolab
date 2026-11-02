/**
 * The Postgres connection, pinned to `globalThis`.
 *
 * Next bundles route handlers and page renders separately, so a module-level
 * client can be instantiated more than once per server — each opening its own
 * pool. Pinning to `globalThis` gives every module the same pool and survives
 * dev-server hot reloads.
 *
 * `DATABASE_URL` is provided by docker-compose (points at the `db` service) and
 * by `.env` for local runs. Neon connections use its WebSocket-compatible Pool
 * so development still works on networks that block outbound Postgres TCP.
 */

import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool as NodePool } from "pg";

import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  __juryzaPool?: NodePool;
};

const connectionString =
  process.env.DATABASE_URL ?? "postgres://juryza:juryza@localhost:5432/juryza";
const isNeon = connectionString.includes(".neon.tech/");
const Pool = isNeon ? NeonPool : NodePool;

export const pool =
  globalForDb.__juryzaPool ??
  (new Pool({
    connectionString,
    max: 10,
  }) as NodePool);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__juryzaPool = pool;
}

export const db = drizzle(pool, { schema });

export * from "./schema";
export { schema };
