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
  participant2: "participant_2",
  participant3: "participant_3",
  participant4: "participant_4",
  participant5: "participant_5",
  participant6: "participant_6",
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
    expect(doc.paths["/api/teams/{id}/join"]).toBeDefined();
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

  test("a coach can create and manage their own event", async () => {
    const stamp = Date.now();
    const slug = `coach-event-${stamp}`;
    const hour = 3_600_000;
    const iso = (offset: number) => new Date(stamp + offset * hour).toISOString();
    const body = {
      name: `Coach event ${stamp}`,
      slug,
      workflow: "innolab",
      visibility: "draft",
      pitchSubmissionsOpen: iso(-2),
      pitchSubmissionsClose: iso(1),
      pitchVotingOpen: iso(2),
      pitchVotingClose: iso(3),
      submissionsOpen: iso(4),
      submissionsClose: iso(24),
    };

    expect(
      (await call("/api/events", { as: as.participant, method: "POST", body })).status
    ).toBe(403);

    const created = await call("/api/events", { as: as.judgeA, method: "POST", body });
    expect(created.status).toBe(201);

    try {
      expect((await call(`/api/events/${slug}/overview`, { as: as.judgeA })).status).toBe(200);
      const rubric = obj((await call(`/api/events/${slug}/rubric`, { as: as.judgeA })).data);
      expect(rubric.criteria).toHaveLength(6);

      const coachUpdate = await call(`/api/events/${slug}/rubric`, {
        as: as.judgeA,
        method: "PUT",
        body: { criteria: rubric.criteria },
      });
      expect(coachUpdate.status).toBe(403);
    } finally {
      expect(
        (await call(`/api/events/${slug}`, { as: as.judgeA, method: "DELETE" })).status
      ).toBe(200);
    }
  });

  test("pairwise judging is disabled for coaches", async () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await call(`/api/events/${SAMPLE}/pairwise`, {
        as: as.judgeA,
        method,
        body: method === "POST" ? { winnerId: "a", loserId: "b" } : undefined,
      });
      expect(res.status).toBe(403);
      expect(obj(res.data).error).toMatch(/disabled/i);
    }
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

  test("event audit versions and resources stay manager-owned and participant-readable", async () => {
    const stamp = Date.now();
    const slug = `workspace-test-${stamp}`;
    const hour = 3_600_000;
    const iso = (offset: number) => new Date(stamp + offset * hour).toISOString();
    let createdEvent = false;

    try {
      const created = await call("/api/events", {
        as: as.organizer,
        method: "POST",
        body: {
          name: `Workspace integration ${stamp}`,
          slug,
          workflow: "innolab",
          visibility: "published",
          pitchSubmissionsOpen: iso(-2),
          pitchSubmissionsClose: iso(1),
          pitchVotingOpen: iso(2),
          pitchVotingClose: iso(3),
          submissionsOpen: iso(4),
          submissionsClose: iso(24),
          votingOpen: iso(25),
          votingClose: iso(26),
        },
      });
      expect(created.status).toBe(201);
      createdEvent = true;

      expect((await call(`/api/events/${slug}/documents`)).status).toBe(403);
      expect((await call(`/api/events/${slug}/resources`)).status).toBe(403);
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(200);

      const firstDocument = await call(`/api/events/${slug}/documents`, {
        as: as.organizer,
        method: "POST",
        body: {
          title: "Audit initial",
          url: "https://example.test/audits/v1",
          summary: "Initial audit",
          findings: ["Finding one"],
          problems: ["Problem one"],
        },
      });
      expect(firstDocument.status).toBe(201);
      expect(obj(firstDocument.data).version).toBe(1);

      const secondDocument = await call(`/api/events/${slug}/documents`, {
        as: as.organizer,
        method: "POST",
        body: {
          title: "Audit current",
          url: "https://example.test/audits/v2",
          summary: "Current audit",
          findings: ["Finding two"],
          problems: [],
        },
      });
      expect(secondDocument.status).toBe(201);
      expect(obj(secondDocument.data).version).toBe(2);

      const participantDocuments = obj(
        (await call(`/api/events/${slug}/documents`, { as: as.participant })).data
      );
      const visibleDocuments = participantDocuments.documents as Record<string, unknown>[];
      expect(visibleDocuments).toHaveLength(1);
      expect(visibleDocuments[0]).toMatchObject({ title: "Audit current", version: 2 });

      const managerDocuments = obj(
        (await call(`/api/events/${slug}/documents`, { as: as.organizer })).data
      );
      expect(managerDocuments.documents).toHaveLength(2);

      const createdResource = await call(`/api/events/${slug}/resources`, {
        as: as.organizer,
        method: "POST",
        body: {
          kind: "tool",
          name: "Shared workshop",
          category: "Infrastructure",
          description: "Shared workspace without stored credentials.",
          url: "https://example.test/workshop",
          accessLevel: "event",
          availability: "available",
          ownerName: "Operations",
          position: 10,
        },
      });
      expect(createdResource.status).toBe(201);
      const resourceId = String(obj(createdResource.data).id);

      const participantResources = obj(
        (await call(`/api/events/${slug}/resources`, { as: as.participant })).data
      );
      expect(participantResources.resources).toHaveLength(1);
      expect((participantResources.resources as Record<string, unknown>[])[0]).toMatchObject({
        id: resourceId,
        name: "Shared workshop",
      });

      expect(
        (
          await call(`/api/resources/${resourceId}`, {
            as: as.participant,
            method: "PATCH",
            body: { name: "Unauthorized change" },
          })
        ).status
      ).toBe(403);

      const updatedResource = await call(`/api/resources/${resourceId}`, {
        as: as.organizer,
        method: "PATCH",
        body: { name: "Workshop updated" },
      });
      expect(updatedResource.status).toBe(200);
      expect(
        (
          await call(`/api/events/${slug}/resources`, {
            as: as.participant,
            method: "POST",
            body: { kind: "tool", name: "Blocked", category: "Blocked" },
          })
        ).status
      ).toBe(403);
      expect(
        (
          await call(`/api/resources/${resourceId}`, {
            as: as.organizer,
            method: "DELETE",
          })
        ).status
      ).toBe(200);
    } finally {
      if (createdEvent) {
        await call(`/api/events/${slug}`, { as: as.organizer, method: "DELETE" });
      }
    }
  });

  test("calendar activities and ICS feeds enforce event audiences", async () => {
    const stamp = Date.now();
    const slug = `calendar-test-${stamp}`;
    const hour = 3_600_000;
    const iso = (offset: number) => new Date(stamp + offset * hour).toISOString();
    let createdEvent = false;

    try {
      const created = await call("/api/events", {
        as: as.organizer,
        method: "POST",
        body: {
          name: `Calendar integration ${stamp}`,
          slug,
          workflow: "innolab",
          visibility: "published",
          pitchSubmissionsOpen: iso(-2),
          pitchSubmissionsClose: iso(1),
          pitchVotingOpen: iso(2),
          pitchVotingClose: iso(3),
          submissionsOpen: iso(4),
          submissionsClose: iso(24),
          votingOpen: iso(25),
          votingClose: iso(26),
        },
      });
      expect(created.status).toBe(201);
      createdEvent = true;
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(200);

      const addActivity = async (title: string, audience: string, offset: number) => {
        const response = await call(`/api/events/${slug}/schedule`, {
          as: as.organizer,
          method: "POST",
          body: {
            title,
            description: `${title} details`,
            startsAt: iso(offset),
            endsAt: iso(offset + 1),
            location: "Geneva",
            kind: "workshop",
            audience,
            required: true,
          },
        });
        expect(response.status).toBe(201);
        return String(obj(obj(response.data).item).id);
      };

      const publicId = await addActivity("Public launch", "all", 5);
      await addActivity("Participant workshop", "participants", 7);
      await addActivity("Organizer briefing", "organizers", 9);

      const publicSchedule = obj((await call(`/api/events/${slug}/schedule`)).data);
      expect(publicSchedule.schedule).toHaveLength(1);
      expect((publicSchedule.schedule as Record<string, unknown>[])[0]?.title).toBe(
        "Public launch"
      );

      const participantSchedule = obj(
        (await call(`/api/events/${slug}/schedule`, { as: as.participant })).data
      );
      expect(
        (participantSchedule.schedule as Record<string, unknown>[]).map((item) => item.title)
      ).toEqual(["Public launch", "Participant workshop"]);

      const managerSchedule = obj(
        (await call(`/api/events/${slug}/schedule`, { as: as.organizer })).data
      );
      expect(managerSchedule.schedule).toHaveLength(3);
      expect(
        (
          await call(`/api/events/${slug}/schedule`, {
            as: as.participant,
            method: "POST",
            body: {
              title: "Blocked activity",
              startsAt: iso(10),
              endsAt: iso(11),
            },
          })
        ).status
      ).toBe(403);
      expect(
        (
          await call(`/api/schedule-items/${publicId}`, {
            as: as.participant,
            method: "PATCH",
            body: { title: "Unauthorized change" },
          })
        ).status
      ).toBe(403);

      const publicFeed = await call(`/api/events/${slug}/calendar.ics`);
      expect(publicFeed.status).toBe(200);
      expect(publicFeed.type).toContain("text/calendar");
      expect(String(publicFeed.data)).toContain("SUMMARY:Public launch");
      expect(String(publicFeed.data)).not.toContain("Participant workshop");
      expect(String(publicFeed.data)).not.toContain("Organizer briefing");

      const subscription = await call(`/api/events/${slug}/calendar-subscription`, {
        as: as.participant,
        method: "POST",
      });
      expect(subscription.status).toBe(201);
      const privatePath = new URL(String(obj(subscription.data).url)).pathname;
      const privateFeed = await call(privatePath);
      expect(privateFeed.status).toBe(200);
      expect(String(privateFeed.data)).toContain("SUMMARY:Public launch");
      expect(String(privateFeed.data)).toContain("SUMMARY:Participant workshop");
      expect(String(privateFeed.data)).not.toContain("Organizer briefing");

      expect(
        (
          await call(`/api/schedule-items/${publicId}`, {
            as: as.organizer,
            method: "DELETE",
          })
        ).status
      ).toBe(200);
      const cancelledFeed = await call(`/api/events/${slug}/calendar.ics`);
      expect(String(cancelledFeed.data)).toContain("STATUS:CANCELLED");

      expect(
        (
          await call(`/api/events/${slug}/calendar-subscription`, {
            as: as.participant,
            method: "DELETE",
          })
        ).status
      ).toBe(200);
      expect((await call(privatePath)).status).toBe(404);
    } finally {
      if (createdEvent) {
        await call(`/api/events/${slug}`, { as: as.organizer, method: "DELETE" });
      }
    }
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
          maxTeamSize: 6,
          votingOpen: iso(-1),
          votingClose: iso(20),
        },
      });
      expect(created.status).toBe(201);
      createdEvent = true;

      const finalBallot = obj(
        (await call(`/api/events/${slug}/ballot`, { as: as.participant })).data
      );
      expect(finalBallot.enabled).toBe(false);
      expect(finalBallot.open).toBe(false);
      expect(finalBallot.projects).toEqual([]);

      const participantProjectVote = await call(`/api/events/${slug}/votes`, {
        as: as.participant,
        method: "POST",
        body: { projectId: "not-a-project", votes: 1 },
      });
      expect(participantProjectVote.status).toBe(403);
      expect(obj(participantProjectVote.data).error).toMatch(/appointed judges/i);

      const organizerJudgeInvite = await call(`/api/events/${slug}/judges`, {
        as: as.organizer,
        method: "POST",
        body: { email: `blocked-judge-${stamp}@example.test`, trackIds: [] },
      });
      expect(organizerJudgeInvite.status).toBe(403);
      expect(obj(organizerJudgeInvite.data).error).toMatch(/platform admins/i);
      const panel = obj((await call(`/api/events/${slug}/judges`, { as: as.organizer })).data);
      expect(panel.canManage).toBe(false);
      expect(panel.invites).toEqual([]);

      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(200);
      const pitchAuthors = [
        as.participant,
        as.participant2,
        as.participant3,
        as.participant4,
        as.participant5,
        as.participant6,
      ];
      for (const participant of pitchAuthors.slice(1)) {
        expect(
          (await call(`/api/events/${slug}/registration`, { as: participant, method: "POST" }))
            .status
        ).toBe(200);
      }
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.judgeA, method: "POST" })).status
      ).toBe(200);
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.judgeB, method: "POST" })).status
      ).toBe(200);

      const pitchIds: string[] = [];
      for (let index = 1; index <= 6; index++) {
        const response = await call(`/api/events/${slug}/pitches`, {
          as: pitchAuthors[index - 1],
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
      const duplicatePitch = await call(`/api/events/${slug}/pitches`, {
        as: as.participant,
        method: "POST",
        body: {
          title: "A second idea",
          description: "This participant already proposed an idea for this Innovation Lab.",
          submit: true,
        },
      });
      expect(duplicatePitch.status).toBe(409);
      expect(obj(duplicatePitch.data).error).toMatch(/already have a pitch/i);
      const coachPitch = await call(`/api/events/${slug}/pitches`, {
        as: as.judgeB,
        method: "POST",
        body: {
          title: "Coach idea",
          description: "A coach cannot propose a pitch in place of a participant.",
          submit: true,
        },
      });
      expect(coachPitch.status).toBe(403);
      expect(obj(coachPitch.data).error).toMatch(/only registered participants/i);

      const privateParticipantData = obj(
        (await call(`/api/events/${slug}/pitches`, { as: as.participant })).data
      );
      const privateParticipantList = privateParticipantData.pitches as { id: string }[];
      expect(privateParticipantList.map((pitch) => pitch.id)).toEqual([pitchIds[0] as string]);
      expect(obj(privateParticipantData.viewer).canCreate).toBe(false);
      const privatePublicList = obj((await call(`/api/events/${slug}/pitches`)).data).pitches as {
        id: string;
      }[];
      expect(privatePublicList).toEqual([]);
      expect(
        (
          await call(`/api/events/${slug}/pitch-presentation`, {
            as: as.organizer,
            method: "POST",
          })
        ).status
      ).toBe(403);

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

      const selectedPitch = pitchIds[0] as string;
      const firstChoice = pitchIds[4] as string;
      const secondChoice = pitchIds[5] as string;
      expect(
        (
          await call(`/api/events/${slug}/pitch-presentation`, {
            as: as.participant,
            method: "POST",
          })
        ).status
      ).toBe(403);
      expect(
        (await call(`/api/pitches/${firstChoice}/vote`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(403);
      const presentation = await call(`/api/events/${slug}/pitch-presentation`, {
        as: as.organizer,
        method: "POST",
      });
      expect(presentation.status).toBe(200);
      expect(obj(presentation.data).created).toBe(true);
      const revealedPitches = obj(
        (await call(`/api/events/${slug}/pitches`, { as: as.participant })).data
      ).pitches as { id: string; title: string; description: string }[];
      expect(revealedPitches).toHaveLength(6);
      expect(revealedPitches.find((pitch) => pitch.id === firstChoice)).toMatchObject({
        title: "Idea 5",
        description: "Original immutable description for idea 5.",
      });
      expect(
        (await call(`/api/pitches/${firstChoice}/vote`, { as: as.judgeA, method: "POST" })).status
      ).toBe(403);
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.organizer, method: "POST" }))
          .status
      ).toBe(200);
      expect(
        (await call(`/api/pitches/${firstChoice}/vote`, { as: as.organizer, method: "POST" }))
          .status
      ).toBe(403);
      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.organizer, method: "DELETE" }))
          .status
      ).toBe(200);
      expect(
        (await call(`/api/pitches/${selectedPitch}/vote`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(403);
      expect(
        (await call(`/api/pitches/${firstChoice}/vote`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(200);
      expect(
        (await call(`/api/pitches/${secondChoice}/vote`, { as: as.participant, method: "POST" }))
          .status
      ).toBe(200);

      const changedVote = obj(
        (await call(`/api/events/${slug}/pitches`, { as: as.participant })).data
      ).pitches as { id: string; voted: boolean }[];
      expect(changedVote.filter((pitch) => pitch.voted).map((pitch) => pitch.id)).toEqual([
        secondChoice,
      ]);
      expect(
        (await call(`/api/pitches/${firstChoice}/vote`, { as: as.participant, method: "POST" }))
          .status
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
      expect(rows.find((pitch) => pitch.id === firstChoice)?.votes).toBe(1);
      expect(rows.find((pitch) => pitch.id === secondChoice)?.votes).toBe(0);

      const selection = await call(`/api/events/${slug}/pitch-selection`, {
        as: as.organizer,
        method: "POST",
        body: { count: 5 },
      });
      expect(selection.status).toBe(200);
      const selectionData = obj(selection.data);
      const selectedIds = selectionData.selected as string[];
      expect(selectedIds).toHaveLength(5);
      expect(selectedIds).toContain(firstChoice);
      expect(obj(selectionData.tieBreak).candidatePitchIds).not.toEqual([]);
      const automaticProjects = selectionData.projects as {
        pitchId: string;
        projectId: string;
        teamId: string;
      }[];
      expect(automaticProjects).toHaveLength(5);
      expect(
        (
          await call(`/api/events/${slug}/pitch-selection`, {
            as: as.organizer,
            method: "POST",
            body: { count: 5 },
          })
        ).status
      ).toBe(409);

      const mainProject = automaticProjects.find((entry) => entry.pitchId === firstChoice);
      expect(mainProject).toBeDefined();
      const projectId = String(mainProject?.projectId);
      const teamId = String(mainProject?.teamId);
      const projectDetail = obj(
        (await call(`/api/projects/${projectId}`, { as: pitchAuthors[4] })).data
      );
      expect(obj(projectDetail.project).pitchId).toBe(firstChoice);
      expect(obj(projectDetail.project).title).toBe("Idea 5");

      const secondProject = automaticProjects.find(
        (entry) => entry.pitchId !== firstChoice && pitchIds.slice(0, 4).includes(entry.pitchId)
      );
      expect(secondProject).toBeDefined();
      const secondTeamId = String(secondProject?.teamId);

      const joinableDashboard = obj(
        (await call(`/api/events/${slug}/dashboard`, { as: as.judgeA })).data
      );
      const joinableProjects = joinableDashboard.selectedProjects as {
        projectId: string | null;
        joinState: string;
        team: { id: string; memberCount: number; capacity: number; registrationState: string };
      }[];
      expect(joinableProjects.find((entry) => entry.projectId === projectId)).toMatchObject({
        joinState: "available",
        team: { id: teamId, memberCount: 1, capacity: 6, registrationState: "open" },
      });

      expect((await call(`/api/teams/${teamId}/join`, { method: "POST" })).status).toBe(401);
      const unregistered = await call(`/api/teams/${teamId}/join`, {
        as: as.organizer,
        method: "POST",
      });
      expect(unregistered.status).toBe(403);
      expect(obj(unregistered.data).error).toMatch(/register/i);

      const requested = await call(`/api/teams/${teamId}/join`, {
        as: as.judgeA,
        method: "POST",
      });
      expect(requested.status).toBe(200);
      expect(obj(requested.data)).toMatchObject({ status: "pending", alreadyRequested: false });
      const requestId = String(obj(requested.data).requestId);
      expect(
        obj(
          (
            await call(`/api/teams/${teamId}/join`, {
              as: as.judgeA,
              method: "POST",
            })
          ).data
        ).alreadyRequested
      ).toBe(true);

      const incompatible = await call(`/api/teams/${secondTeamId}/join`, {
        as: as.judgeA,
        method: "POST",
      });
      expect(incompatible.status).toBe(409);
      expect(obj(incompatible.data).error).toMatch(/pending request/i);

      const requestedDashboard = obj(
        (await call(`/api/events/${slug}/dashboard`, { as: as.judgeA })).data
      );
      const requestedProjects = requestedDashboard.selectedProjects as {
        projectId: string | null;
        joinState: string;
      }[];
      expect(requestedProjects.find((entry) => entry.projectId === projectId)).toMatchObject({
        joinState: "requested",
      });

      const projectOwner = pitchAuthors[4];
      expect(projectOwner).toBeDefined();
      const ownerTeam = obj(
        (await call(`/api/teams/${teamId}`, { as: projectOwner })).data
      );
      const ownerId = String(
        (ownerTeam.members as { id: string; role: string }[]).find(
          (member) => member.role === "owner"
        )?.id
      );
      const ownerCannotLeave = await call(
        `/api/teams/${teamId}/members/${ownerId}`,
        { as: projectOwner, method: "DELETE" }
      );
      expect(ownerCannotLeave.status).toBe(403);
      expect(obj(ownerCannotLeave.data).error).toMatch(/responsable initial/i);
      const pendingRequests = obj(
        (await call(`/api/teams/${teamId}/join`, { as: projectOwner })).data
      ).requests as { id: string; participant: { id: string } }[];
      expect(pendingRequests.map((request) => request.id)).toContain(requestId);
      const approved = await call(`/api/teams/${teamId}/join`, {
        as: projectOwner,
        method: "PATCH",
        body: { requestId, decision: "approve" },
      });
      expect(approved.status).toBe(200);
      expect(obj(approved.data)).toMatchObject({ status: "approved", alreadyMember: false });

      const alreadyOnProject = await call(`/api/teams/${secondTeamId}/join`, {
        as: as.judgeA,
        method: "POST",
      });
      expect(alreadyOnProject.status).toBe(409);
      expect(obj(alreadyOnProject.data).error).toMatch(/already belong/i);

      expect(
        (await call(`/api/events/${slug}/registration`, { as: as.organizer, method: "POST" }))
          .status
      ).toBe(200);
      const additionalRequest = await call(`/api/teams/${teamId}/join`, {
        as: as.organizer,
        method: "POST",
      });
      expect(additionalRequest.status).toBe(200);
      expect(obj(additionalRequest.data)).toMatchObject({ status: "pending" });

      const secondTeamOwner = pitchAuthors[pitchIds.indexOf(String(secondProject?.pitchId))];
      expect(secondTeamOwner).toBeDefined();
      const secondTeam = obj(
        (await call(`/api/teams/${secondTeamId}`, { as: secondTeamOwner })).data
      );
      expect(obj(secondTeam.team).inviteUrl).toBeUndefined();

      const joinedDashboard = obj(
        (await call(`/api/events/${slug}/dashboard`, { as: as.judgeA })).data
      );
      const joinedProjects = joinedDashboard.selectedProjects as {
        projectId: string | null;
        joinState: string;
        team: { memberCount: number; registrationState: string };
      }[];
      expect(joinedProjects.find((entry) => entry.projectId === projectId)).toMatchObject({
        joinState: "joined",
        team: { memberCount: 2, registrationState: "open" },
      });

      const finalList = obj(
        (await call(`/api/events/${slug}/pitches`, { as: as.participant })).data
      );
      const finalRows = finalList.pitches as {
        id: string;
        status: string;
        description: string;
        projectId: string | null;
      }[];
      expect(finalRows.find((pitch) => pitch.id === firstChoice)).toMatchObject({
        status: "selected",
        description: "Original immutable description for idea 5.",
        projectId,
      });
      const rejected = finalRows.find((pitch) => pitch.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected", projectId: null });
      expect(
        (
          await call(`/api/pitches/${rejected?.id}/project`, {
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
