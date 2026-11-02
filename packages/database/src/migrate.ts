import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client as NeonClient, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client as NodeClient, Pool as NodePool } from "pg";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = resolve(packageDir, "drizzle");
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is missing.");
}

const isNeon = connectionString.includes(".neon.tech/");
const Client = isNeon ? NeonClient : NodeClient;
const Pool = isNeon ? NeonPool : NodePool;
const client = new Client({ connectionString }) as NodeClient;
const pool = new Pool({ connectionString, max: 1 }) as NodePool;
const db = drizzle(pool);

try {
  await client.connect();

  const { rows: tables } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'"
  );
  const { rows: tracking } = await client.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists"
  );
  const trackingExists = tracking[0]?.exists ?? false;
  const { rows: applied } = trackingExists
    ? await client.query<{ count: string }>(
        'select count(*)::text as count from "drizzle"."__drizzle_migrations"'
      )
    : { rows: [{ count: "0" }] };

  if (tables.length > 0 && Number(applied[0]?.count ?? 0) === 0) {
    const journalPath = resolve(migrationsFolder, "meta/_journal.json");
    const snapshotPath = resolve(migrationsFolder, "meta/0000_snapshot.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      tables: Record<string, unknown>;
    };
    const baseline = journal.entries[0];

    if (!baseline) throw new Error("No initial Drizzle migration was generated.");

    const existingNames = new Set(tables.map((table) => table.tablename));
    const missingTables = Object.keys(snapshot.tables)
      .map((name) => name.slice(name.indexOf(".") + 1))
      .filter((name) => !existingNames.has(name));

    if (missingTables.length > 0) {
      throw new Error(
        `Cannot baseline this database; missing schema tables: ${missingTables.join(", ")}`
      );
    }

    const baselineSql = await readFile(resolve(migrationsFolder, `${baseline.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(baselineSql).digest("hex");

    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    await client.query(
      'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
      [hash, baseline.when]
    );
    console.info(`[database] baselined existing schema at ${baseline.tag}`);
  }
} finally {
  await client.end();
}

try {
  await migrate(db, { migrationsFolder });
  console.info("[database] migrations are up to date");
} finally {
  await pool.end();
}
