/**
 * Seed the portal. Runs at container boot after the schema is pushed.
 *
 * Idempotent: if the well-known simulation accounts already exist the seed
 * does nothing (so restarting never duplicates fixtures). Unrelated users do
 * not prevent the demo data from being added; `SEED_RESET=1` truncates
 * everything first.
 *
 *  1. Well-known accounts: admin, organizer, judge_a, judge_b, participant.
 *  2. The DOGFOOD fixture event, imported through the same importer the
 *     `POST /api/events/import` endpoint uses — with the fixture's *past*
 *     submission deadline, so the portal is honestly closed to submissions.
 *     Community voting is open, so the T3 flow is live on first boot.
 *  3. A sandbox event with submissions open, so an evaluator can walk the whole
 *     lifecycle (team → project → judging → results) without editing dates.
 *  4. API tokens for the four checker roles, written to `.dogfood.toml`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray, like, sql } from "drizzle-orm";

import {
  apiToken,
  assignment,
  db,
  event,
  eventJudge,
  prize,
  project,
  registration,
  rubricCriterion,
  score,
  team,
  teamMember,
  track,
  user as userTable,
} from "@/lib/db";
import { raptorsBundles, raptorsPeople } from "@/lib/db/raptors";
import { id, secretToken } from "@/lib/ids";
import { docToText } from "@/lib/rich-text";
import { auth } from "@/lib/server/auth";
import { type Bundle, importBundle } from "@/lib/server/bundle";
import { hashToken } from "@/lib/server/identity";

const DAY = 24 * 60 * 60 * 1000;

function loadFixtures(): Bundle {
  const candidates = [
    process.env.FIXTURES_PATH,
    join(process.cwd(), "fixtures.json"),
    join(process.cwd(), "..", "..", "fixtures.json"),
  ].filter(Boolean) as string[];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as Bundle;
    } catch {}
  }
  throw new Error(`fixtures.json not found. Tried: ${candidates.join(", ")}`);
}

async function createUser(o: {
  email: string;
  name: string;
  password: string;
  role: string;
  username: string;
  headline?: string;
  image?: string;
  githubUrl?: string;
  bio?: string;
  skills?: string[];
  points?: number;
  prizeUsd?: number;
  awardsCount?: number;
}) {
  const res = await auth.api.signUpEmail({
    body: { email: o.email, name: o.name, password: o.password },
  });
  await db
    .update(userTable)
    .set({
      role: o.role,
      username: o.username,
      headline: o.headline ?? null,
      image: o.image ?? null,
      githubUrl: o.githubUrl ?? null,
      bio: o.bio ?? null,
      skills: o.skills ?? [],
      points: o.points ?? 0,
      prizeUsd: o.prizeUsd ?? 0,
      awardsCount: o.awardsCount ?? 0,
      emailVerified: true,
    })
    .where(eq(userTable.id, res.user.id));
  return res.user.id;
}

async function mintToken(userId: string, label: string) {
  const token = `jz_${secretToken(40)}`;
  await db.insert(apiToken).values({
    id: id.apiToken(),
    userId,
    label,
    tokenHash: hashToken(token),
    prefix: token.slice(0, 9),
  });
  return token;
}

async function truncateAll() {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`
  );
  if (rows.length) {
    await db.execute(
      sql.raw(
        `TRUNCATE TABLE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
      )
    );
  }
}

const doc = (...blocks: unknown[]) => ({ type: "doc" as const, content: blocks });
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const ul = (...items: string[]) => ({
  type: "bulletList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});

async function main() {
  if (process.env.SEED_RESET === "1") {
    console.info("[seed] SEED_RESET=1 — truncating all tables");
    await truncateAll();
  } else {
    const [existing] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, "organizer@juryza.test"))
      .limit(1);
    if (existing) {
      console.info("[seed] data already present; keeping it (set SEED_RESET=1 to reseed)");
      await writeCheckerConfig();
      return;
    }
  }

  // ---- 1. Well-known accounts --------------------------------------------
  await createUser({
    email: "admin@juryza.test",
    name: "Ada Admin",
    password: "admin-password-123",
    role: "admin",
    username: "admin",
    headline: "Platform administrator",
  });
  const organizerId = await createUser({
    email: "organizer@juryza.test",
    name: "Olivia Organizer",
    password: "organizer-password-123",
    role: "organizer",
    username: "organizer",
    headline: "Runs Sample Hack",
  });
  const judgeAId = await createUser({
    email: "judge.a@juryza.test",
    name: "Judge A",
    password: "judge-a-password-123",
    role: "judge",
    username: "judge_a",
    headline: "Staff engineer",
  });
  const judgeBId = await createUser({
    email: "judge.b@juryza.test",
    name: "Judge B",
    password: "judge-b-password-123",
    role: "judge",
    username: "judge_b",
    headline: "Product designer",
  });
  const participantId = await createUser({
    email: "participant@juryza.test",
    name: "Pat Participant",
    password: "participant-password-123",
    role: "participant",
    username: "participant",
    headline: "Full-stack developer",
  });
  await db
    .update(userTable)
    .set({
      skills: ["TypeScript", "React", "Postgres"],
      bio: "Building things on weekends.",
      lookingForTeam: true,
    })
    .where(eq(userTable.id, participantId));

  // ---- 2. The fixture event --------------------------------------------
  const fx = loadFixtures();
  const now = Date.now();
  const fixtureBundle: Bundle = {
    ...fx,
    event: {
      ...fx.event,
      slug: "sample-hack-2026",
      tagline: "The shared DOGFOOD 2026 dataset: forty projects, thirty judges, eight tracks.",
      description:
        "Seeded from the DOGFOOD 2026 fixtures. Submissions closed on the fixture's deadline; judging data includes the awkward cases on purpose — a judge who gave every project the same score, unfinished review batches and a duplicate submission.",
      submissions_open: new Date(
        new Date(fx.event.submissions_close).getTime() - 3 * DAY
      ).toISOString(),
      voting_open: new Date(now - DAY).toISOString(),
      voting_close: new Date(now + 14 * DAY).toISOString(),
      voting_access: "authenticated",
      vote_budget: 16,
      hue: 262,
    },
    rubric: [
      {
        key: "functionality",
        label: "Functionality",
        weight: 0.4,
        description: "Does it work end to end?",
      },
      {
        key: "quality",
        label: "Code quality",
        weight: 0.35,
        description: "Is it well built and maintainable?",
      },
      {
        key: "innovation",
        label: "Innovation",
        weight: 0.25,
        description: "Is the idea or approach new?",
      },
    ],
    prizes: [
      { name: "Grand Prize", kind: "overall", amount: "$800", rank: 1 },
      { name: "Runner-up", kind: "overall", amount: "$500", rank: 2 },
      { name: "Third place", kind: "overall", amount: "$350", rank: 3 },
      { name: "Community Choice", kind: "community", amount: "$100", rank: 1 },
    ],
    // Derive comparisons from the fixture scores so the pairwise leaderboard has
    // signal on first boot: for each judge, adjacent projects in their own
    // ordering ("higher beats lower"). Documented in JUDGING.md.
    pairwise: Array.from(
      fx.scores.reduce(
        (m, s) => m.set(s.judge, [...(m.get(s.judge) ?? []), s]),
        new Map<string, Bundle["scores"]>()
      )
    ).flatMap(([judge, list]) => {
      const avg = (c: Record<string, number>) =>
        Object.values(c).reduce((a, b) => a + b, 0) / Object.values(c).length;
      const ordered = [...list].sort((a, b) => avg(b.criteria) - avg(a.criteria));
      return ordered.slice(0, -1).flatMap((w, i) => {
        const l = ordered[i + 1];
        return l && avg(w.criteria) !== avg(l.criteria)
          ? [{ judge, winner: w.project, loser: l.project }]
          : [];
      });
    }),
  };
  const fixture = await importBundle(fixtureBundle, {
    createdBy: organizerId,
    visibility: "published",
    isFixture: true,
    passwordFor: (email) =>
      fx.judges.some((j) => j.email === email) ? "judge-password-123" : "member-password-123",
  });
  console.info(
    "[seed] fixture event:",
    fixture.slug,
    fixture.created,
    fixture.skipped.length ? `${fixture.skipped.length} skipped` : ""
  );

  // judge_a and judge_b sit on the fixture panel with real, disjoint work, so the
  // cross-judge isolation check has something to protect.
  const fxProjects = fx.projects.map((x) => x.id);
  for (const [judgeId, projects, marks] of [
    [judgeAId, fxProjects.slice(0, 3), { functionality: 4, quality: 4, innovation: 3 }],
    [judgeBId, fxProjects.slice(3, 6), { functionality: 3, quality: 5, innovation: 4 }],
  ] as const) {
    await db.insert(eventJudge).values({ eventId: fixture.eventId, userId: judgeId, trackIds: [] });
    for (const projectId of projects) {
      await db
        .insert(assignment)
        .values({ id: id.assignment(), eventId: fixture.eventId, judgeId, projectId })
        .onConflictDoNothing();
      await db
        .insert(score)
        .values({
          id: id.score(),
          eventId: fixture.eventId,
          judgeId,
          projectId,
          criteria: marks,
          comment: "Seeded review.",
        })
        .onConflictDoNothing();
    }
    // One unscored assignment each, so the judge console has work to do.
    await db
      .insert(assignment)
      .values({
        id: id.assignment(),
        eventId: fixture.eventId,
        judgeId,
        projectId: fxProjects[judgeId === judgeAId ? 10 : 11] as string,
      })
      .onConflictDoNothing();
  }

  // ---- 3. A live sandbox event -----------------------------------------
  const sandboxId = id.event();
  await db.insert(event).values({
    id: sandboxId,
    slug: "open-build-2026",
    name: "Open Build 2026",
    tagline: "A live sandbox event — submissions are open. Try the whole lifecycle.",
    description:
      "Form a team, write up your project, submit it, and watch judging and voting happen.",
    content: doc(
      h(2, "About"),
      p(
        "Open Build is a sandbox event seeded so you can try every part of Juryza without editing any dates: form a team, write your project up in the editor, submit it, then switch accounts to judge it."
      ),
      h(2, "What to build"),
      ul(
        "Tools that make open-source maintainers' lives easier",
        "Anything that runs offline, on one machine",
        "Something you would still use next month"
      ),
      h(2, "Schedule"),
      p(
        "Submissions close ten days after the seed ran. Judging runs for four days after that, then community voting opens."
      )
    ),
    rules: doc(
      ul(
        "Teams of one to four people.",
        "All code written during the event window. Libraries and AI tools are fine.",
        "One project per team. You can edit it until the deadline.",
        "Judges never review a project from their own team."
      )
    ),
    mode: "hybrid",
    location: "Online + Berlin",
    hue: 160,
    visibility: "published",
    isFixture: true,
    submissionsOpen: new Date(now - 2 * DAY),
    submissionsClose: new Date(now + 10 * DAY),
    judgingClose: new Date(now + 14 * DAY),
    votingOpen: new Date(now + 10 * DAY),
    votingClose: new Date(now + 14 * DAY),
    votingAccess: "open",
    voteBudget: 25,
    createdBy: organizerId,
  });
  const tracks = [
    ["Developer tools", "Make building software better."],
    ["Climate & energy", "Measure, reduce, adapt."],
    ["Civic tech", "Tools for communities and public services."],
    ["Open track", "Anything else you are excited about."],
  ] as const;
  const trackIds = tracks.map(() => id.track());
  await db.insert(track).values(
    tracks.map(([name, description], position) => ({
      id: trackIds[position] as string,
      eventId: sandboxId,
      name,
      description,
      position,
    }))
  );
  await db.insert(rubricCriterion).values(
    [
      {
        key: "impact",
        label: "Impact",
        description: "Does it solve a real problem for real people?",
        weight: 0.3,
      },
      {
        key: "execution",
        label: "Execution",
        description: "Does it work? Is it well built?",
        weight: 0.35,
      },
      {
        key: "innovation",
        label: "Innovation",
        description: "Is the idea or approach new?",
        weight: 0.2,
      },
      {
        key: "presentation",
        label: "Presentation",
        description: "Is it clearly explained and demoed?",
        weight: 0.15,
      },
    ].map((c, position) => ({ ...c, id: id.criterion(), eventId: sandboxId, position }))
  );
  await db.insert(prize).values([
    {
      id: id.prize(),
      eventId: sandboxId,
      kind: "overall",
      name: "Best overall",
      amount: "$1,000",
      rank: 1,
    },
    {
      id: id.prize(),
      eventId: sandboxId,
      kind: "overall",
      name: "Runner-up",
      amount: "$500",
      rank: 2,
    },
    {
      id: id.prize(),
      eventId: sandboxId,
      kind: "track",
      trackId: trackIds[0],
      name: "Best developer tool",
      amount: "$250",
      rank: 1,
    },
    {
      id: id.prize(),
      eventId: sandboxId,
      kind: "community",
      name: "People's choice",
      amount: "$150",
      rank: 1,
    },
  ]);
  for (const judgeId of [judgeAId, judgeBId]) {
    await db.insert(eventJudge).values({ eventId: sandboxId, userId: judgeId, trackIds: [] });
  }
  // The participant has a team and a draft, to show the editor on first login.
  const teamId = id.team();
  await db.insert(team).values({
    id: teamId,
    eventId: sandboxId,
    name: "Night Owls",
    description: "Two devs and a designer who work best after midnight.",
    lookingForMembers: true,
    inviteToken: secretToken(24),
  });
  await db.insert(teamMember).values({ teamId, userId: participantId, role: "owner" });
  await db.insert(registration).values({ eventId: sandboxId, userId: participantId });
  const draft = doc(
    h(2, "The problem"),
    p("Maintainers spend their evenings triaging duplicate issues."),
    h(2, "What we built"),
    p("Issue Radar clusters incoming issues by similarity and suggests the canonical one."),
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [p("Clustering prototype")] },
        { type: "taskItem", attrs: { checked: false }, content: [p("GitHub app integration")] },
        { type: "taskItem", attrs: { checked: false }, content: [p("Record the demo video")] },
      ],
    }
  );
  await db.insert(project).values({
    id: id.project(),
    eventId: sandboxId,
    teamId,
    trackId: trackIds[0],
    title: "Issue Radar",
    tagline: "Finds the duplicate before you do.",
    content: draft,
    description: docToText(draft),
    techTags: ["TypeScript", "Postgres"],
    status: "draft",
  });

  // ---- 4. Hackathon Raptors showcase -----------------------------------
  // Real past events, rebuilt from the community's published dataset (see
  // lib/db/raptors.ts), imported through the same path as every other event.
  // Pre-seed all real builders (including sanjaysah101) with their GitHub
  // avatars, real usernames, stats, and uniform password (member-password-123).
  if (process.env.SEED_SHOWCASE !== "0") {
    const people = raptorsPeople();
    console.info(`[seed] pre-seeding ${people.length} real builders from Hackathon Raptors...`);
    for (const p of people) {
      try {
        await createUser({
          email: p.email,
          name: p.name,
          username: p.username,
          password: "member-password-123",
          role: "participant",
          headline: p.headline,
          bio: p.bio,
          image: p.image,
          githubUrl: p.githubUrl ?? undefined,
          skills: p.skills,
          points: p.points,
          prizeUsd: p.prizeUsd,
          awardsCount: p.awardsCount,
        });
      } catch {
        // Builder may already exist
      }
    }
    console.info("[seed] real builders pre-seeded with avatars & stats.");

    const showcase = raptorsBundles();
    let showcaseOk = 0;
    for (const bundle of showcase) {
      try {
        const report = await importBundle(bundle, {
          createdBy: organizerId,
          visibility: "published",
          isFixture: false,
          passwordFor: () => "member-password-123",
        });
        await db
          .update(event)
          .set({ resultsPublished: true, isFixture: false })
          .where(eq(event.id, report.eventId));
        showcaseOk += 1;
      } catch (err) {
        console.warn(`[seed] raptors showcase "${bundle.event.slug}" skipped:`, err);
      }
    }
    console.info(`[seed] raptors showcase: ${showcaseOk}/${showcase.length} events`);
  }

  await writeCheckerConfig();
}

/**
 * Mint fresh API tokens for the four checker accounts and write
 * `.dogfood.toml`. Runs on every boot — also when existing data is kept — so
 * the file always holds working credentials. Old checker tokens are revoked.
 */
async function writeCheckerConfig() {
  const accounts = await db
    .select({ id: userTable.id, username: userTable.username })
    .from(userTable)
    .where(inArray(userTable.username, ["organizer", "judge_a", "judge_b", "participant"]));
  const idOf = (username: string) => {
    const found = accounts.find((a) => a.username === username);
    if (!found)
      throw new Error(`checker account "${username}" is missing — reseed with SEED_RESET=1`);
    return found.id;
  };
  await db.delete(apiToken).where(like(apiToken.label, "acceptance: %"));
  const tokens = {
    organizer: await mintToken(idOf("organizer"), "acceptance: organizer"),
    judge_a: await mintToken(idOf("judge_a"), "acceptance: judge_a"),
    judge_b: await mintToken(idOf("judge_b"), "acceptance: judge_b"),
    participant: await mintToken(idOf("participant"), "acceptance: participant"),
  };

  const baseUrl = process.env.PORTAL_BASE_URL ?? "http://localhost:8080";
  const toml = `# Generated by the Juryza seed on boot (apps/juryza/src/lib/db/seed.ts).
# The acceptance checker reads this. Tokens are re-minted on every boot.

[portal]
base_url = "${baseUrl}"

[tiers]
claimed = ["T1", "T2", "T3", "T4"]
pitch = "Self-hosted hackathon platform with judging, community voting, a REST API, webhooks, certificates and bulk import/export."

[auth]
organizer   = "Authorization: Bearer ${tokens.organizer}"
judge_a     = "Authorization: Bearer ${tokens.judge_a}"
judge_b     = "Authorization: Bearer ${tokens.judge_b}"
participant = "Authorization: Bearer ${tokens.participant}"

[routes]
gallery      = "/api/events/sample-hack-2026/projects"
submit       = "/api/events/sample-hack-2026/projects"
judge_scores = "/api/judge/scores"
peer_scores  = "/api/judge/scores?judge=judge_a"
csv_export   = "/api/events/sample-hack-2026/export?dataset=results"
`;
  for (const path of [
    process.env.DOGFOOD_TOML_PATH,
    join(process.cwd(), "..", "..", ".dogfood.toml"),
  ].filter(Boolean) as string[]) {
    try {
      writeFileSync(path, toml, "utf-8");
      console.info(`[seed] wrote ${path}`);
      break;
    } catch {}
  }

  const line = "=".repeat(64);
  console.info(`\n${line}\nJuryza is seeded. Sign in at ${baseUrl}/login with:\n${line}`);
  console.info("  admin        admin@juryza.test        admin-password-123");
  console.info("  organizer    organizer@juryza.test    organizer-password-123");
  console.info("  judge A      judge.a@juryza.test      judge-a-password-123");
  console.info("  judge B      judge.b@juryza.test      judge-b-password-123");
  console.info("  participant  participant@juryza.test  participant-password-123");
  console.info(
    "  Sanjay Sah   sanjaysah101@raptors.community  member-password-123 (GitHub: sanjaysah101)"
  );
  console.info("  All participants password: member-password-123");
  console.info(`${line}\n`);
}

main()
  .then(() => {
    console.info("[seed] done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  });
