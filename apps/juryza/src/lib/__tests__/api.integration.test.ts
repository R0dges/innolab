import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * HTTP integration tests for the backend's integrity rules, run against a live
 * instance with the seeded demo data:
 *
 *   JURYZA_TEST_URL=http://localhost:3000 bun test src/lib/__tests__
 *
 * Skipped entirely when JURYZA_TEST_URL is unset. Every write made here is
 * undone before the test ends.
 */

const BASE = process.env.JURYZA_TEST_URL?.replace(/\/+$/, "") ?? "";
const SAMPLE = "sample-hack-2026";

setDefaultTimeout(60_000);

type Session = { authorization: string };

/**
 * Credentials come from the seeded API tokens in `.dogfood.toml` — the same
 * ones the acceptance checker uses — so the suite never trips the sign-in rate
 * limiter. Point JURYZA_TEST_TOML elsewhere if the file lives somewhere else.
 */
const ROLES = {
  organizer: "organizer",
  judgeA: "judge_a",
  judgeB: "judge_b",
  participant: "participant",
} as const;

function readTokens(): Record<keyof typeof ROLES, Session> {
  const path =
    process.env.JURYZA_TEST_TOML ??
    join(import.meta.dir, "..", "..", "..", "..", "..", ".dogfood.toml");
  const toml = readFileSync(path, "utf-8");
  const out = {} as Record<keyof typeof ROLES, Session>;
  for (const [role, key] of Object.entries(ROLES)) {
    const m = toml.match(new RegExp(`^${key}\\s*=\\s*"Authorization: (Bearer [^"]+)"`, "m"));
    if (!m?.[1]) throw new Error(`no ${key} token in ${path}`);
    out[role as keyof typeof ROLES] = { authorization: m[1] };
  }
  return out;
}

async function call(path: string, init: { as?: Session; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Origin: BASE };
  if (init.as) headers.Authorization = init.as.authorization;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const type = res.headers.get("content-type") ?? "";
  const data: unknown = type.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, type, data };
}

const obj = (x: unknown) => x as Record<string, unknown>;

describe.skipIf(!BASE)("API integrity rules", () => {
  let as = {} as Record<keyof typeof ROLES, Session>;

  beforeAll(() => {
    as = readTokens();
  });

  test("the OpenAPI document is public and CORS-open", async () => {
    const res = await fetch(`${BASE}/api/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).length).toBeGreaterThan(40);
  });

  test("the gallery is public", async () => {
    const res = await call(`/api/events/${SAMPLE}/projects`);
    expect(res.status).toBe(200);
    expect(obj(res.data).count).toBeGreaterThan(0);
  });

  test("an unauthenticated caller gets 401 on authenticated routes", async () => {
    expect((await call("/api/me")).status).toBe(401);
    expect((await call(`/api/events/${SAMPLE}/overview`)).status).toBe(401);
  });

  test("a closed event refuses new projects with 403", async () => {
    const res = await call(`/api/events/${SAMPLE}/projects`, {
      as: as.participant,
      method: "POST",
      body: { title: "Late entry" },
    });
    expect(res.status).toBe(403);
    expect(obj(res.data).error).toMatch(/closed/i);
  });

  test("judge B cannot read judge A's scores", async () => {
    const me = await call("/api/me", { as: as.judgeA });
    expect(me.status).toBe(200);
    const judgeA = obj(obj(me.data).user);

    for (const ref of [judgeA.username, judgeA.id]) {
      const res = await call(`/api/judge/scores?judge=${encodeURIComponent(String(ref))}`, {
        as: as.judgeB,
      });
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.data)).not.toContain('"scores"');
    }
    const own = await call("/api/judge/scores", { as: as.judgeB });
    expect(own.status).toBe(200);
  });

  test("a participant cannot read judge scores", async () => {
    expect((await call("/api/judge/scores", { as: as.participant })).status).toBe(403);
  });

  test("the organizer can export CSV", async () => {
    const res = await call(`/api/events/${SAMPLE}/export?dataset=results`, { as: as.organizer });
    expect(res.status).toBe(200);
    expect(res.type).toContain("text/csv");
    expect(String(res.data).split("\r\n")[0]?.length).toBeGreaterThan(0);
  });

  test("non-organizers get 403 on the organizer dashboard and exports", async () => {
    expect((await call(`/api/events/${SAMPLE}/overview`, { as: as.participant })).status).toBe(403);
    expect((await call(`/api/events/${SAMPLE}/overview`, { as: as.judgeA })).status).toBe(403);
    expect(
      (await call(`/api/events/${SAMPLE}/export?dataset=scores`, { as: as.judgeA })).status
    ).toBe(403);
    expect((await call(`/api/events/${SAMPLE}/overview`, { as: as.organizer })).status).toBe(200);
  });

  test("unpublished results carry no numbers for the public", async () => {
    const res = await call(`/api/events/${SAMPLE}/results`);
    expect(res.status).toBe(200);
    expect(obj(res.data).published).toBe(false);
    expect(obj(res.data).projects).toBeUndefined();
    const participant = await call(`/api/events/${SAMPLE}/results`, { as: as.participant });
    expect(obj(participant.data).projects).toBeUndefined();
  });

  test("the vote budget is enforced by the server", async () => {
    const ballot = obj((await call(`/api/events/${SAMPLE}/ballot`, { as: as.participant })).data);
    expect(ballot.open).toBe(true);
    const budget = Number(ballot.budget);
    const max = Number(ballot.maxVotesPerProject);
    let remaining = budget - Number(ballot.spent);
    const candidates = (
      ballot.projects as { id: string; ownTeam: boolean; myVotes: number }[]
    ).filter((p) => !p.ownTeam && p.myVotes === 0);
    const touched: string[] = [];

    try {
      const over = await call(`/api/events/${SAMPLE}/votes`, {
        as: as.participant,
        method: "POST",
        body: { projectId: candidates[0]?.id, votes: max + 1 },
      });
      expect(over.status).toBe(400);

      // Spend credits until one more allocation cannot be afforded, then try it.
      let i = 0;
      while (remaining >= max * max) {
        const p = candidates[i++];
        if (!p) throw new Error("not enough projects to exhaust the budget");
        const res = await call(`/api/events/${SAMPLE}/votes`, {
          as: as.participant,
          method: "POST",
          body: { projectId: p.id, votes: max },
        });
        expect(res.status).toBe(200);
        touched.push(p.id);
        remaining -= max * max;
        expect(obj(res.data).remaining).toBe(remaining);
      }
      const target = candidates[i];
      if (!target) throw new Error("no project left to overspend on");
      const votes = Math.ceil(Math.sqrt(remaining + 1));
      const res = await call(`/api/events/${SAMPLE}/votes`, {
        as: as.participant,
        method: "POST",
        body: { projectId: target.id, votes },
      });
      expect(res.status).toBe(400);
      expect(obj(res.data).error).toMatch(/credits/);
    } finally {
      for (const projectId of touched) {
        await call(`/api/events/${SAMPLE}/votes`, {
          as: as.participant,
          method: "POST",
          body: { projectId, votes: 0 },
        });
      }
    }
    const after = obj((await call(`/api/events/${SAMPLE}/ballot`, { as: as.participant })).data);
    expect(after.spent).toBe(ballot.spent);
  });

  test("voting for your own team's project is refused (when the voter has one)", async () => {
    for (const session of [as.participant, as.judgeA, as.judgeB, as.organizer]) {
      const ballot = obj((await call(`/api/events/${SAMPLE}/ballot`, { as: session })).data);
      const own = (ballot.projects as { id: string; ownTeam: boolean }[]).find((p) => p.ownTeam);
      if (!own) continue;
      const res = await call(`/api/events/${SAMPLE}/votes`, {
        as: session,
        method: "POST",
        body: { projectId: own.id, votes: 1 },
      });
      expect(res.status).toBe(403);
      return;
    }
    console.info(
      "[integration] no demo account has a team in the voting event; own-team vote check not applicable"
    );
  });

  test("anonymous voters are asked to sign in on an authenticated vote", async () => {
    const gallery = obj((await call(`/api/events/${SAMPLE}/projects`)).data);
    const first = (gallery.projects as { id: string }[])[0];
    const res = await call(`/api/events/${SAMPLE}/votes`, {
      method: "POST",
      body: { projectId: first?.id, votes: 1 },
    });
    expect(res.status).toBe(401);
  });

  test("the Innolab journey keeps the original pitch linked to the selected project", async () => {
    const stamp = Date.now();
    const slug = `innolab-test-${stamp}`;
    const hour = 3_600_000;
    const iso = (offset: number) => new Date(stamp + offset * hour).toISOString();
    let createdEvent = false;

    try {
      const created = await call("/api/events", {
        as: as.organizer,
        method: "POST",
        body: {
          name: `Innolab integration ${stamp}`,
          slug,
          workflow: "innolab",
          visibility: "published",
          pitchSubmissionsOpen: iso(-2),
          pitchSubmissionsClose: iso(1),
          pitchVotingOpen: iso(2),
          pitchVotingClose: iso(3),
          submissionsOpen: iso(4),
          submissionsClose: iso(24),
        },
      });
      expect(created.status).toBe(201);
      createdEvent = true;

      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(200);
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.judgeA, method: "POST" })).status
      ).toBe(200);

      const pitchIds: string[] = [];
      for (let index = 1; index <= 6; index++) {
        const response = await call(`/api/events/${slug}/pitches`, {
          as: as.participant,
          method: "POST",
          body: {
            title: `Idea ${index}`,
            description: `Original immutable description for idea ${index}.`,
            submit: true,
          },
        });
        expect(response.status).toBe(201);
        pitchIds.push(String(obj(response.data).id));
      }

      const openVoting = await call(`/api/events/${slug}`, {
        as: as.organizer,
        method: "PATCH",
        body: {
          pitchSubmissionsClose: iso(-0.5),
          pitchVotingOpen: iso(-0.25),
          pitchVotingClose: iso(1),
          submissionsOpen: iso(2),
        },
      });
      expect(openVoting.status).toBe(200);

      const votedPitch = pitchIds[0] as string;
      expect(
        (await call(`/api/pitches/${votedPitch}/vote`, { as: as.judgeA, method: "POST" })).status
      ).toBe(200);
      expect(
        (await call(`/api/pitches/${votedPitch}/vote`, { as: as.judgeA, method: "POST" })).status
      ).toBe(200);

      const close = await call(`/api/events/${slug}`, {
        as: as.organizer,
        method: "PATCH",
        body: { pitchVotingClose: iso(-0.1), submissionsOpen: iso(-0.05) },
      });
      expect(close.status).toBe(200);

      const afterVote = obj(
        (await call(`/api/events/${slug}/pitches`, { as: as.participant })).data
      );
      const rows = afterVote.pitches as { id: string; votes: number; description: string }[];
      expect(rows.find((pitch) => pitch.id === votedPitch)?.votes).toBe(1);

      const selectedIds = pitchIds.slice(0, 5);
      const selection = await call(`/api/events/${slug}/pitch-selection`, {
        as: as.organizer,
        method: "POST",
        body: { pitchIds: selectedIds },
      });
      expect(selection.status).toBe(200);

      const project = await call(`/api/pitches/${votedPitch}/project`, {
        as: as.participant,
        method: "POST",
        body: { teamName: "Selected builders", projectTitle: "Developed idea" },
      });
      expect(project.status).toBe(201);
      const projectId = String(obj(project.data).id);
      const projectDetail = obj(
        (await call(`/api/projects/${projectId}`, { as: as.participant })).data
      );
      expect(obj(projectDetail.project).pitchId).toBe(votedPitch);
      expect(obj(projectDetail.project).title).toBe("Developed idea");

      const finalList = obj(
        (await call(`/api/events/${slug}/pitches`, { as: as.participant })).data
      );
      const finalRows = finalList.pitches as {
        id: string;
        status: string;
        description: string;
        projectId: string | null;
      }[];
      expect(finalRows.find((pitch) => pitch.id === votedPitch)).toMatchObject({
        status: "selected",
        description: "Original immutable description for idea 1.",
        projectId,
      });
      const rejected = finalRows.find((pitch) => pitch.id === pitchIds[5]);
      expect(rejected).toMatchObject({ status: "rejected", projectId: null });
      expect(
        (
          await call(`/api/pitches/${pitchIds[5]}/project`, {
            as: as.participant,
            method: "POST",
            body: { teamName: "Rejected team" },
          })
        ).status
      ).toBe(403);
    } finally {
      if (createdEvent) {
        await call(`/api/events/${slug}`, { as: as.organizer, method: "DELETE" });
      }
    }
  });
});
