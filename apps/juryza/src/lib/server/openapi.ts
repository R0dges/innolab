import { z } from "zod";

import { bundleSchema } from "@/lib/server/bundle";
import { DATASETS } from "@/lib/server/exports";
import { eventInput, eventPatch, projectInput } from "@/lib/server/schemas";
import { optionalUrl } from "@/lib/server/validation";
import { WEBHOOK_EVENTS } from "@/lib/server/webhooks";

/**
 * The OpenAPI 3.1 description of every route under `app/api/**`.
 *
 * Each operation is declared once with `op()`: its tag, who may call it, its
 * query parameters and (as a Zod schema) its request body. Shared bodies are the
 * very schemas the routes parse with (`eventInput`, `projectInput`,
 * `bundleSchema`…); route-local bodies are mirrored here as Zod and rendered with
 * `z.toJSONSchema`, so the spec, the validator and the error messages agree.
 * Path parameters, security and the common error responses are derived.
 */

type Json = Record<string, unknown>;
type Method = "get" | "post" | "put" | "patch" | "delete";
/** public: no credential needed. optional: works signed out, richer signed in. user: 401 without a credential. */
type Access = "public" | "optional" | "user";
type ErrorCode = 400 | 401 | 403 | 404 | 409 | 429 | 503;

const TAGS = {
  Auth: "Better Auth session endpoints (cookie sessions for browsers). API clients use a personal token instead.",
  Events: "Hackathons: details, lifecycle dates, configuration, registration and announcements.",
  "Tracks & rubric": "Tracks (categories), weighted scoring criteria and the prize table.",
  Teams: "Team formation: create, join by invite link, leave, disband.",
  Projects: "Submissions: the public gallery, drafts, editing and similarity.",
  Comments: "The public discussion thread on each submitted project.",
  Judging: "The judging panel, assignments and a judge's own rubric scores.",
  Voting: "Quadratic community voting: ballots, votes and email verification.",
  Results: "The leaderboard (hidden until published) and side-by-side comparison.",
  "Organizer data":
    "Organizer console data: dashboard, audit trail, exports, bundles and duplicate detection.",
  Certificates: "Signed participation and winner certificates, publicly verifiable.",
  Webhooks: "Signed HTTP callbacks for event activity.",
  Me: "The caller's own account, dashboard and personal API tokens.",
  Users: "Public profiles.",
  Admin: "Platform administration (admins only).",
  System: "Operational endpoints for monitors and tooling.",
} as const;
type Tag = keyof typeof TAGS;

interface Param {
  description: string;
  schema?: Json;
  required?: boolean;
}

interface OpSpec {
  tag: Tag;
  summary: string;
  /** Behaviour and authorization rules (Markdown). */
  description: string;
  access?: Access;
  query?: Record<string, Param>;
  body?: z.ZodType;
  /** Path-parameter descriptions that differ from the defaults. */
  params?: Record<string, string>;
  status?: 200 | 201;
  /** What the success response carries (Markdown). */
  returns: string;
  /** Media type of the success response. */
  produces?: "json" | "csv-or-json";
  errors?: ErrorCode[];
}

const DEFAULT_PARAMS: Record<string, string> = {
  event: "Event slug or id (e.g. `sample-hack-2026`).",
  id: "Resource id.",
  userId: "User id.",
  username: "The person's username.",
  serial: "Certificate serial (case-insensitive).",
  token: "The invitation token from the invite link.",
};

const str = { type: "string" };
const int = { type: "integer" };

/** Drop Zod's generated regex where a `format` (email, date-time, uri) already says it. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "pattern" && "format" in node) continue;
    out[k] = tidy(v);
  }
  return out;
}

/** A Zod schema as a JSON Schema describing what a client may send. */
export function jsonSchema(schema: z.ZodType): Json {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Json;
  return tidy(rest) as Json;
}

const SECURITY: Record<Access, Json[]> = {
  public: [],
  optional: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
  user: [{ bearerAuth: [] }, { cookieAuth: [] }],
};

const paths: Record<string, Record<string, Json>> = {};

function op(method: Method, path: string, spec: OpSpec) {
  const access = spec.access ?? "user";
  const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
  const parameters = [
    ...pathParams.map((name) => ({
      name,
      in: "path",
      required: true,
      description: spec.params?.[name] ?? DEFAULT_PARAMS[name] ?? name,
      schema: str,
    })),
    ...Object.entries(spec.query ?? {}).map(([name, p]) => ({
      name,
      in: "query",
      required: p.required ?? false,
      description: p.description,
      schema: p.schema ?? str,
    })),
  ];

  const errors = new Set<ErrorCode>(spec.errors ?? []);
  if (spec.body) errors.add(400);
  if (access === "user") errors.add(401);
  if (pathParams.length) errors.add(404);

  const status = spec.status ?? 200;
  const content =
    spec.produces === "csv-or-json"
      ? {
          "text/csv": { schema: str },
          "application/json": { schema: { type: "array", items: { type: "object" } } },
        }
      : { "application/json": { schema: { type: "object" } } };

  const operationId = `${method}${path
    .replace(/^\/api/, "")
    .replace(/\{(\w+)\}/g, "By-$1")
    .split(/[/.\-[\]]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")}`;

  paths[path] ??= {};
  paths[path][method] = {
    operationId,
    tags: [spec.tag],
    summary: spec.summary,
    description: spec.description,
    security: SECURITY[access],
    "x-access": access,
    ...(parameters.length && { parameters }),
    ...(spec.body && {
      requestBody: {
        required: true,
        content: { "application/json": { schema: jsonSchema(spec.body) } },
      },
    }),
    responses: {
      [status]: { description: spec.returns, content },
      ...Object.fromEntries(
        [...errors].sort().map((code) => [code, { $ref: `#/components/responses/E${code}` }])
      ),
    },
  };
}

/* ─────────────────────────── Route-local request bodies ─────────────────────────── */

const email = z.email().describe("Email address (case-insensitive).");

const bodies = {
  signIn: z.object({
    email,
    password: z.string().min(8),
    rememberMe: z.boolean().optional().describe("Keep the session beyond the browser session."),
  }),
  signUp: z.object({
    name: z.string().min(1),
    email,
    password: z.string().min(8).describe("At least 8 characters."),
  }),
  announcement: z.object({
    title: z.string().min(2).max(120),
    body: z.string().min(1).max(4000),
    pinned: z.boolean().default(false).describe("Pinned announcements are listed first."),
  }),
  assignments: z.object({
    strategy: z
      .enum(["balanced", "batch"])
      .default("balanced")
      .describe(
        "`balanced`: each project gets N reviews from the least-loaded eligible judges. `batch`: contiguous chunks, one review each."
      ),
    reviewsPerProject: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Defaults to the event's setting."),
    dryRun: z
      .boolean()
      .default(false)
      .describe("Plan and report coverage without writing anything."),
  }),
  certificates: z.object({ kind: z.enum(["judges", "winners"]) }),
  judgeTracks: z.object({
    trackIds: z
      .array(z.string())
      .max(30)
      .describe("Track ids this judge covers; empty = all tracks."),
  }),
  judgeInvite: z.object({
    email,
    trackIds: z.array(z.string()).max(30).default([]).describe("Empty = all tracks."),
  }),
  prizes: z.object({
    prizes: z
      .array(
        z.object({
          kind: z.enum(["overall", "track", "community"]).default("overall"),
          trackId: z
            .string()
            .nullish()
            .describe('Required for `kind: "track"`, ignored otherwise.'),
          name: z.string().min(1).max(80),
          description: z.string().max(400).nullish(),
          amount: z.string().max(40).nullish().describe('Free text, e.g. "$1,000".'),
          rank: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(1)
            .describe("Which place wins it (1 = first)."),
        })
      )
      .max(40),
  }),
  results: z.object({
    published: z.boolean(),
    closeVoting: z
      .boolean()
      .default(false)
      .describe("End a still-open voting window now, so results can be published."),
  }),
  rubric: z.object({
    criteria: z
      .array(
        z.object({
          key: z
            .string()
            .regex(/^[a-z][a-z0-9_]{0,31}$/)
            .describe("Stable lowercase identifier marks are stored against, e.g. `code_quality`."),
          label: z.string().min(1).max(60),
          description: z.string().max(400).nullish(),
          weight: z
            .number()
            .positive()
            .max(100)
            .describe("Relative weight; normalized to sum to 1 when scoring."),
        })
      )
      .min(1)
      .max(12),
  }),
  team: z.object({
    name: z.string().min(2).max(60),
    description: z.string().max(500).nullish(),
    lookingForMembers: z.boolean().default(false),
  }),
  teamPatch: z.object({
    name: z.string().min(2).max(60).optional(),
    description: z.string().max(500).nullish(),
    lookingForMembers: z.boolean().optional(),
  }),
  tracks: z.object({
    tracks: z
      .array(
        z.object({
          id: z
            .string()
            .optional()
            .describe("Existing track id to update in place; omit to create."),
          name: z.string().min(1).max(60),
          description: z.string().max(400).nullish(),
        })
      )
      .max(30),
  }),
  voter: z.object({
    email,
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .describe("Omit to request a code; send the 6-digit code to verify."),
  }),
  vote: z.object({
    projectId: z.string().min(1),
    votes: z
      .number()
      .int()
      .min(0)
      .max(50)
      .describe("Votes for this project (0 removes them). Costs votes² credits."),
  }),
  webhook: z.object({
    url: z.url().describe("http(s) endpoint that receives POSTs."),
    events: z
      .array(z.enum(WEBHOOK_EVENTS))
      .default([])
      .describe("Event types to receive; empty = all."),
  }),
  webhookPatch: z.object({
    active: z.boolean().optional(),
    url: z.url().optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
  }),
  score: z.object({
    projectId: z.string().min(1),
    criteria: z
      .record(z.string(), z.number().int().min(1).max(5))
      .describe('A 1–5 mark for every rubric key, e.g. `{ "impact": 4 }`.'),
    favorite: z
      .boolean()
      .default(false)
      .describe("The coach's single +1 coup de cœur for this event."),
    comment: z.string().max(4000).nullish(),
  }),
  me: z.object({
    name: z.string().min(1).max(80).optional(),
    username: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-_]{1,30}[a-z0-9])$/)
      .optional()
      .describe("3–32 characters: letters, numbers, dashes, underscores."),
    headline: z.string().max(120).nullish(),
    bio: z.string().max(50000).nullish(),
    location: z.string().max(80).nullish(),
    websiteUrl: optionalUrl,
    githubUrl: optionalUrl,
    image: optionalUrl.describe("Avatar URL."),
    skills: z.array(z.string().min(1).max(30)).max(20).optional(),
    lookingForTeam: z.boolean().optional(),
  }),
  token: z.object({ label: z.string().min(1).max(60) }),
  joinTeam: z.object({
    token: z.string().min(1).describe("The token from the team's invite link."),
  }),
  adminUser: z.object({
    role: z.enum(["participant", "judge", "organizer", "admin"]).optional(),
    banned: z
      .boolean()
      .optional()
      .describe("true suspends the account and signs it out everywhere."),
  }),
};

const ORGANIZERS =
  "**Event managers only:** 403 unless the caller created this event as a coach (or is an admin).";
const ADMINS = "**Admins only:** 403 for every other platform role.";

/* ─────────────────────────────────── Auth ─────────────────────────────────── */

op("post", "/api/auth/sign-up/email", {
  tag: "Auth",
  access: "public",
  summary: "Create an account",
  description:
    "Better Auth email + password sign-up. New accounts get the `participant` role and a generated username, and are signed in (session cookie set). Rate limited to 5 per minute. Send an `Origin` header matching the app.",
  body: bodies.signUp,
  returns: "`{ token, user }` and a `Set-Cookie` session.",
  errors: [429],
});
op("post", "/api/auth/sign-in/email", {
  tag: "Auth",
  access: "public",
  summary: "Sign in",
  description:
    "Better Auth email + password sign-in; sets the session cookie used by `cookieAuth`. Rate limited to 10 per minute. Browsers and cookie-jar clients must send an `Origin` header matching the app (CSRF protection).",
  body: bodies.signIn,
  returns: "`{ redirect, token, user }` and a `Set-Cookie` session.",
  errors: [401, 429],
});
op("post", "/api/auth/sign-out", {
  tag: "Auth",
  summary: "Sign out",
  description:
    "Ends the cookie session. Personal API tokens are unaffected — revoke them with `DELETE /api/me/tokens`.",
  returns: "`{ success: true }`.",
});
op("get", "/api/auth/get-session", {
  tag: "Auth",
  access: "optional",
  summary: "Current session",
  description:
    "The Better Auth session behind the cookie, or `null` when signed out. Does not accept bearer tokens — use `GET /api/me`.",
  returns: "`{ session, user }` or `null`.",
});

/* ────────────────────────────────── Events ────────────────────────────────── */

op("get", "/api/events", {
  tag: "Events",
  access: "optional",
  summary: "List events",
  description:
    "Published events, plus the caller's own drafts (admins see every event). Newest deadline first.",
  returns: "`{ events: (Event & { projectCount, participantCount })[] }`.",
});
op("post", "/api/events", {
  tag: "Events",
  summary: "Create an event",
  description:
    'Requires the `judge` (coach) platform role or above (403 otherwise). Starts as a draft unless `visibility: "published"`, owned by the caller, with the default six-criterion Innovation Lab rubric and the given `tracks`. 409 if the slug is taken.',
  body: eventInput,
  status: 201,
  returns: "`{ id, slug }`.",
  errors: [403, 409],
});
op("post", "/api/events/import", {
  tag: "Events",
  summary: "Import an event bundle",
  description:
    "Requires the `organizer` role. Creates a NEW draft event owned by the caller from a Juryza bundle (`GET /api/events/{event}/bundle`) or any file in the DOGFOOD fixtures shape. Ids are kept when free and remapped when they collide; people are matched by email and unknown emails get a fresh account.",
  body: bundleSchema,
  status: 201,
  returns:
    "`{ eventId, slug, created: { users, tracks, teams, projects, judges, scores, comparisons }, skipped: string[] }`.",
  errors: [403],
});
op("get", "/api/events/{event}", {
  tag: "Events",
  access: "optional",
  summary: "Get an event",
  description:
    "The event with tracks, prizes, rubric, judging panel, the latest five announcements (pinned first) and counts. Draft events 404 for anyone but their organizers. Signed-in callers also get `viewer`.",
  returns:
    "`{ event, tracks, prizes, criteria, judges, announcements, counts: { projects, participants, teams }, viewer: { registered, team, isJudge, canManage } | null }`.",
});
op("patch", "/api/events/{event}", {
  tag: "Events",
  summary: "Update an event",
  description: `${ORGANIZERS} Only the fields sent are changed; 409 if a new slug is taken.`,
  body: eventPatch,
  returns: "`{ event }` — the updated event.",
  errors: [403, 409],
});
op("delete", "/api/events/{event}", {
  tag: "Events",
  summary: "Delete an event",
  description: `${ORGANIZERS} Deletes the event and everything in it (teams, projects, scores, votes). Irreversible.`,
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("post", "/api/events/{event}/registration", {
  tag: "Events",
  summary: "Register for an event",
  description: "Registers the caller. 403 once submissions have closed. Idempotent.",
  returns: "`{ registered: true }`.",
  errors: [403],
});
op("delete", "/api/events/{event}/registration", {
  tag: "Events",
  summary: "Withdraw registration",
  description: "400 while the caller is still on a team — leave it first.",
  returns: "`{ registered: false }`.",
  errors: [400],
});
op("get", "/api/events/{event}/announcements", {
  tag: "Events",
  access: "optional",
  summary: "List announcements",
  description: "Organizer updates, pinned first, then newest.",
  returns: "`{ announcements: Announcement[] }`.",
});
op("post", "/api/events/{event}/announcements", {
  tag: "Events",
  summary: "Post an announcement",
  description: ORGANIZERS,
  body: bodies.announcement,
  status: 201,
  returns: "`{ id }`.",
  errors: [403],
});
op("delete", "/api/announcements/{id}", {
  tag: "Events",
  summary: "Delete an announcement",
  params: { id: "Announcement id." },
  description: "**Organizers only:** 403 unless the caller manages the announcement's event.",
  returns: "`{ ok: true }`.",
  errors: [403],
});

/* ───────────────────────────── Tracks & rubric ───────────────────────────── */

op("get", "/api/events/{event}/tracks", {
  tag: "Tracks & rubric",
  access: "optional",
  summary: "List tracks",
  description: "The event's tracks in display order.",
  returns: "`{ tracks: Track[] }`.",
});
op("put", "/api/events/{event}/tracks", {
  tag: "Tracks & rubric",
  summary: "Replace tracks",
  description: `${ORGANIZERS} Rows with an existing \`id\` are updated in place (projects keep their track), rows without one are created, and tracks left out are deleted (their projects become untracked).`,
  body: bodies.tracks,
  returns: "`{ tracks: Track[] }`.",
  errors: [403],
});
op("get", "/api/events/{event}/rubric", {
  tag: "Tracks & rubric",
  access: "optional",
  summary: "Get the rubric",
  description: "The weighted scoring criteria in display order.",
  returns: "`{ criteria: RubricCriterion[] }`.",
});
op("put", "/api/events/{event}/rubric", {
  tag: "Tracks & rubric",
  summary: "Replace the rubric",
  description: `${ADMINS} Rows are matched by \`key\` (what judges' marks are stored against). Weights are relative and results recompute on read, so re-weighting never invalidates marks. 400 on duplicate keys.`,
  body: bodies.rubric,
  returns: "`{ criteria: RubricCriterion[] }`.",
  errors: [403],
});
op("get", "/api/events/{event}/prizes", {
  tag: "Tracks & rubric",
  access: "optional",
  summary: "List prizes",
  description: "The prize table. Winners are derived from results, never stored.",
  returns: "`{ prizes: Prize[] }`.",
});
op("put", "/api/events/{event}/prizes", {
  tag: "Tracks & rubric",
  summary: "Replace prizes",
  description: `${ORGANIZERS} A prize is awarded by overall judged \`rank\`, by \`rank\` within one track (\`kind: "track"\`), or by community vote (\`kind: "community"\`).`,
  body: bodies.prizes,
  returns: "`{ prizes: Prize[] }`.",
  errors: [403],
});

/* ─────────────────────────────────── Teams ─────────────────────────────────── */

op("get", "/api/events/{event}/teams", {
  tag: "Teams",
  access: "optional",
  summary: "List teams",
  description: "Every team with its members (invite links are never included).",
  returns: "`{ maxTeamSize, teams: (Team & { projectId, members })[] }`.",
});
op("post", "/api/events/{event}/teams", {
  tag: "Teams",
  summary: "Create a team",
  description:
    "The caller becomes the owner and is registered for the event. 403 once submissions have closed; 409 if the caller is already on a team in this event.",
  body: bodies.team,
  status: 201,
  returns: "`{ id, inviteUrl }`.",
  errors: [403, 409],
});
op("get", "/api/teams/{id}", {
  tag: "Teams",
  access: "optional",
  params: { id: "Team id." },
  summary: "Get a team",
  description:
    "The team, its members and project. Members and the event's organizers also get `inviteUrl`, and see a draft project.",
  returns: "`{ team, event, members, project, viewer: { role, canManage, open } }`.",
});
op("patch", "/api/teams/{id}", {
  tag: "Teams",
  params: { id: "Team id." },
  summary: "Update a team",
  description: "403 unless the caller is the team owner or an organizer of the event.",
  body: bodies.teamPatch,
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("delete", "/api/teams/{id}", {
  tag: "Teams",
  params: { id: "Team id." },
  summary: "Disband a team",
  description:
    "Team owner (or an organizer of the event). For owners: 403 after the submission deadline, and 403 while the team still has a project.",
  returns: "`{ ok: true, eventSlug }`.",
  errors: [403],
});
op("post", "/api/teams/{id}/invite", {
  tag: "Teams",
  params: { id: "Team id." },
  summary: "Reset the invite link",
  description:
    "Standard Juryza events only. Team owner only (403 otherwise). Innolab projects use reviewed join requests instead.",
  returns: "`{ inviteUrl }`.",
  errors: [403],
});
op("get", "/api/teams/{id}/join", {
  tag: "Teams",
  params: { id: "Innolab project team id." },
  summary: "List pending project join requests",
  description: "Project owner, event coach or event manager only.",
  returns: "`{ requests: [{ id, status, createdAt, participant }] }`.",
  errors: [403, 404],
});
op("post", "/api/teams/{id}/join", {
  tag: "Teams",
  params: { id: "Team id." },
  summary: "Request to join a selected Innolab project",
  description:
    "Creates a pending request; it never grants membership immediately. The caller must be registered, belong to no project in this event and have no other pending request in it.",
  returns: "`{ requestId, status: 'pending', alreadyRequested }`.",
  errors: [403, 404, 409],
});
op("patch", "/api/teams/{id}/join", {
  tag: "Teams",
  params: { id: "Innolab project team id." },
  summary: "Review a project join request",
  description:
    "Project owner, event coach or event manager only. Approval adds the participant to the project; rejection leaves them free to request another project.",
  body: z.object({
    requestId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
  }),
  returns: "`{ status: 'approved' | 'rejected', alreadyMember? }`.",
  errors: [403, 404, 409],
});
op("delete", "/api/teams/{id}/join", {
  tag: "Teams",
  params: { id: "Innolab project team id." },
  summary: "Cancel one's pending project join request",
  description: "Cancels the authenticated participant's pending request for this project.",
  returns: "`{ status: 'cancelled' }`.",
  errors: [404],
});
op("delete", "/api/teams/{id}/members/{userId}", {
  tag: "Teams",
  params: { id: "Team id.", userId: "The member to remove — the caller's own id to leave." },
  summary: "Leave or remove a member",
  description:
    "Anyone may remove themselves; removing someone else needs the team owner or an organizer (403). Rosters lock at the submission deadline (403, organizers excepted). When the owner leaves, ownership passes to the longest-serving member; the last member leaving disbands the team.",
  returns: "`{ ok: true, disbanded: boolean }`.",
  errors: [400, 403],
});
op("get", "/api/teams/join", {
  tag: "Teams",
  access: "optional",
  summary: "Preview an invite link",
  description: "The team behind an invite token. 404 if the token is invalid or was reset.",
  query: { token: { description: "Invite token.", required: true } },
  returns: "`{ team, event, members, open, full }`.",
  errors: [404],
});
op("post", "/api/teams/join", {
  tag: "Teams",
  summary: "Join a team",
  description:
    "The invite link is the capability — no accept round-trip. Idempotent for current members. 409 if the caller is on another team in the event or the team is full; 403 after the submission deadline.",
  body: bodies.joinTeam,
  returns: "`{ teamId, eventSlug, alreadyMember }`.",
  errors: [403, 404, 409],
});

/* ───────────────────────────────── Projects ───────────────────────────────── */

op("get", "/api/events/{event}/projects", {
  tag: "Projects",
  access: "optional",
  summary: "Project gallery",
  description: "Submitted projects only — public, no auth needed. At most 500.",
  query: {
    q: { description: "Search title, tagline and write-up." },
    track: { description: "Filter by track id." },
    tag: { description: "Filter by tech tag." },
    sort: {
      description: "`newest` (default) or `title`.",
      schema: { type: "string", enum: ["newest", "title"] },
    },
  },
  returns: "`{ event: { id, slug, name }, count, projects: GalleryProject[] }`.",
});
op("post", "/api/events/{event}/projects", {
  tag: "Projects",
  summary: "Start or submit a project",
  description:
    "Creates the caller's team project (draft, or submitted with `submit: true`). **403 once the submission deadline has passed** — enforced by the server whatever the UI shows. 403 if the caller has no team; 409 if the team already has a project.",
  body: projectInput,
  status: 201,
  returns: '`{ id, status: "draft" | "submitted" }`.',
  errors: [403, 409],
});
op("get", "/api/projects/{id}", {
  tag: "Projects",
  access: "optional",
  params: { id: "Project id." },
  summary: "Get a project",
  description:
    "Submitted projects of published events are public. Drafts are visible only to the team and the event's organizers — anyone else gets 404 (no existence leak).",
  returns:
    "`{ project, event, track, team: { id, name, members } | null, viewer: { manager, member, owner, canEdit, submissionsOpen } }`.",
});
op("patch", "/api/projects/{id}", {
  tag: "Projects",
  params: { id: "Project id." },
  summary: "Edit a project",
  description:
    "Team members until the submission deadline; the event's organizers at any time. 403 for anyone else, and 403 for members after the deadline. Only the fields sent change. `submit: true` submits, `submit: false` withdraws back to draft.",
  body: projectInput.partial(),
  returns: "`{ project }`.",
  errors: [403],
});
op("delete", "/api/projects/{id}", {
  tag: "Projects",
  params: { id: "Project id." },
  summary: "Delete a project",
  description: "The team owner before the deadline, or an organizer of the event. 403 otherwise.",
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("get", "/api/projects/{id}/similar", {
  tag: "Projects",
  access: "public",
  params: { id: "A submitted project's id." },
  summary: "Similar projects",
  description: "The four submissions in the same event most similar by content (TF-IDF cosine).",
  returns: "`{ similar: { id, title, tagline, techTags, thumbnailUrl, trackName, score }[] }`.",
});

/* ───────────────────────────────── Comments ───────────────────────────────── */

op("get", "/api/projects/{id}/comments", {
  tag: "Comments",
  access: "public",
  params: { id: "A submitted project's id." },
  summary: "List comments",
  description: "The public discussion thread, oldest first.",
  returns:
    "`{ comments: { id, body, createdAt, authorId, authorName, authorUsername, authorImage }[] }`.",
});
op("post", "/api/projects/{id}/comments", {
  tag: "Comments",
  params: { id: "A submitted project's id." },
  summary: "Post a comment",
  description:
    "Signed-in users only, so every comment has an accountable author. Rate limited to 10 per minute per user (429).",
  body: z.object({ body: z.string().min(1).max(2000) }),
  status: 201,
  returns: "`{ id }`.",
  errors: [429],
});
op("delete", "/api/comments/{id}", {
  tag: "Comments",
  params: { id: "Comment id." },
  summary: "Delete a comment",
  description: "The author, or an organizer of the event (moderation). 403 otherwise.",
  returns: "`{ ok: true }`.",
  errors: [403],
});

/* ───────────────────────────────── Judging ───────────────────────────────── */

op("get", "/api/events/{event}/judges", {
  tag: "Judging",
  summary: "The judging panel",
  description: `${ORGANIZERS} Each judge's tracks and progress (assigned vs scored). For Innolab, only platform admins receive and manage pending invitations.`,
  returns:
    "`{ canManage, judges: { id, name, email, username, image, trackIds, joinedAt, assigned, scored, lastScoredAt }[], invites: { id, email, trackIds, createdAt, inviteUrl }[] }`.",
  errors: [403],
});
op("post", "/api/events/{event}/judges", {
  tag: "Judging",
  summary: "Invite a judge",
  description: `${ORGANIZERS} For Innolab this action is restricted to platform admins. An existing account joins the panel immediately; otherwise an invitation link is created.`,
  body: bodies.judgeInvite,
  status: 201,
  returns: '`{ status: "added", userId, name }` or `{ status: "invited", inviteUrl }`.',
  errors: [403],
});
op("patch", "/api/events/{event}/judges/{userId}", {
  tag: "Judging",
  params: { userId: "The judge's user id." },
  summary: "Change a judge's tracks",
  description: `${ORGANIZERS} For Innolab this action is restricted to platform admins. 404 if the user is not on the panel.`,
  body: bodies.judgeTracks,
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("delete", "/api/events/{event}/judges/{userId}", {
  tag: "Judging",
  params: { userId: "The judge's user id, or a pending invitation id (`inv_…`) to revoke it." },
  summary: "Remove a judge",
  description: `${ORGANIZERS} For Innolab this action is restricted to platform admins. Unscored assignments are released; scores already given are kept as part of the record.`,
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("get", "/api/invites/{token}", {
  tag: "Judging",
  access: "public",
  summary: "Preview a judging invitation",
  description: "404 if the invitation is invalid or was revoked.",
  returns: "`{ email, accepted, event: { slug, name, tagline, hue } }`.",
});
op("post", "/api/invites/{token}", {
  tag: "Judging",
  summary: "Accept a judging invitation",
  description:
    "The signed-in account joins the panel (and gains the judge role). Bound to the invited email: 403 for any other account, and 403 if already used by someone else.",
  returns: "`{ eventSlug }`.",
  errors: [403],
});
op("get", "/api/events/{event}/assignments", {
  tag: "Judging",
  summary: "List assignments",
  description: `${ORGANIZERS} Every assignment with judge, project and whether it has been scored, plus coverage.`,
  returns:
    "`{ reviewsPerProject, coverage: { projects, fullyCovered, underCovered }, assignments: { id, batch, judgeId, judgeName, projectId, projectTitle, trackId, scoredAt, scored }[] }`.",
  errors: [403],
});
op("post", "/api/events/{event}/assignments", {
  tag: "Judging",
  summary: "Generate assignments",
  description: `${ORGANIZERS} Plans judge→project pairs honouring track eligibility and conflicts of interest (a judge never reviews their own team). Re-running tops up coverage and never duplicates. \`dryRun\` previews without writing.`,
  body: bodies.assignments,
  returns: "`{ strategy, reviewsPerProject, judges, pairs, inserted?, dryRun?, coverage }`.",
  errors: [403],
});
op("delete", "/api/events/{event}/assignments", {
  tag: "Judging",
  summary: "Release unscored assignments",
  description: `${ORGANIZERS} Deletes every assignment that has no score yet.`,
  returns: "`{ removed }`.",
  errors: [403],
});
op("get", "/api/judge/queue", {
  tag: "Judging",
  summary: "My judging queue",
  description:
    "Without `event`: the events the caller judges, with progress. With `event`: the caller's assigned projects there (with their own score, if any) and the rubric — 403 if the caller is not on that event's panel. Scoped to the caller; there is no parameter to see anyone else's queue.",
  query: { event: { description: "Event slug or id." } },
  returns: "`{ events }` or `{ event, locked, criteria, total, scored, items }`.",
  errors: [403, 404],
});
op("get", "/api/judge/scores", {
  tag: "Judging",
  summary: "My scores",
  description:
    "The caller's own scores with their weighted value. **Role isolation:** `judge` may only name the caller — asking for another judge is a 403 decided before any row is read (and audited). Callers who are neither a judge nor on any panel (e.g. participants) get 403.",
  query: {
    event: { description: "Limit to one event (slug or id)." },
    judge: { description: "Username or id; must be the caller's own." },
  },
  returns:
    "`{ judge: { id, username, name }, scores: { id, eventId, eventSlug, projectId, projectTitle, criteria, comment, updatedAt, weighted }[] }`.",
  errors: [403, 404],
});
op("post", "/api/judge/scores", {
  tag: "Judging",
  summary: "Save a score",
  description:
    "Creates or updates the caller's score. 403 unless the project is assigned to the caller, and 403 after `judgingClose` or once results are published. 400 unless there is a mark for every rubric key and no unknown keys. Setting `favorite: true` moves the caller's single event-level +1 bonus to this project.",
  body: bodies.score,
  returns: "`{ ok: true }`.",
  errors: [403],
});

/* ────────────────────────────────── Voting ────────────────────────────────── */

op("get", "/api/events/{event}/ballot", {
  tag: "Voting",
  access: "optional",
  summary: "My ballot",
  description:
    "Submitted projects in an order shuffled per voter (stable for one voter, different between voters). Carries only the caller's own allocations and remaining credits — never anyone's totals. The caller's own team's projects are flagged `ownTeam`. In `open` access mode an anonymous voter cookie is issued.",
  returns:
    "`{ event, enabled, open, access, allowedDomains, voter, budget, spent, maxVotesPerProject, projects: { id, title, tagline, thumbnailUrl, trackName, techTags, ownTeam, myVotes }[] }`.",
});
op("post", "/api/events/{event}/votes", {
  tag: "Voting",
  access: "optional",
  summary: "Cast votes",
  description:
    "Sets how many votes the caller gives one project (0 removes them). Quadratic: `votes` costs votes² credits and the total may not exceed the event's `voteBudget` (**400** when exceeded, or above ⌊√budget⌋ per project). 403 outside the voting window; 401 when the access mode needs a sign-in or a verified email; **403 for your own team's project**; 404 for an unknown or unsubmitted project. Rate limited per IP (60/min) and per voter (30/min); at most 3 anonymous voters per network (429).",
  body: bodies.vote,
  returns: "`{ ok: true, votes, spent, remaining }`.",
  errors: [401, 403, 404, 429],
});
op("get", "/api/events/{event}/votes", {
  tag: "Voting",
  summary: "Live tally and abuse signals",
  description: `${ORGANIZERS} Never public while voting runs. Includes voters per network and the busiest minutes.`,
  returns:
    "`{ open, budget, voters, byKind: { user, email, anon }, tally, signals: { sharedNetworks, busiestMinutes }, recent }`.",
  errors: [403],
});
op("post", "/api/events/{event}/voters", {
  tag: "Voting",
  access: "public",
  summary: "Email voter verification",
  description:
    'Only for events with `votingAccess: "email"` (400 otherwise); 403 if the address is outside the allowed domains. Send `{ email }` to receive a 6-digit code (written to the server log offline), then `{ email, code }` to verify — that sets the voter cookie for this event. Codes expire after 15 minutes and allow five attempts (403 after). Rate limited: 5 codes per IP and 3 per address per 10 minutes, 20 verifications per IP (429).',
  body: bodies.voter,
  returns: "`{ sent: true }` or `{ verified: true }`.",
  errors: [403, 429],
});

/* ────────────────────────────────── Results ────────────────────────────────── */

op("get", "/api/events/{event}/results", {
  tag: "Results",
  access: "optional",
  summary: "Leaderboard",
  description:
    "Normalized judged ranking, per-criterion means, track ranks, community votes, pairwise strength and prize winners. **Hidden until published:** everyone but the event's organizers gets `{ published: false, event }` with no numbers at all. Organizers see a `preview` before publishing, and are the only ones who get per-judge calibration (`judges`).",
  returns:
    "`{ published: false, event }` or `{ published, preview, event, criteria, projects, judges?, … }`.",
});
op("post", "/api/events/{event}/results", {
  tag: "Results",
  summary: "Publish or unpublish results",
  description: `${ORGANIZERS} Publishing is refused (403) while community voting is still open, unless \`closeVoting: true\` ends the window now. Publishing locks scores and pairwise verdicts.`,
  body: bodies.results,
  returns: "`{ published }`.",
  errors: [403],
});
op("get", "/api/events/{event}/compare", {
  tag: "Results",
  access: "optional",
  summary: "Compare projects",
  description:
    "Side by side: the projects, a content-similarity matrix and (when scores are visible) head-to-head pairwise records. With one id the server picks rivals — the most similar submissions and, once results are visible, the neighbours in the ranking. Scores appear only when results are published or the caller organizes the event. 400 without ids.",
  query: { ids: { description: "Comma-separated project ids (1–4).", required: true } },
  returns:
    "`{ auto, showScores, criteria, projects: (Project & { result })[], similarity: number[][], headToHead }`.",
  errors: [400],
});

/* ───────────────────────────────── Organizer data ───────────────────────────────── */

op("get", "/api/events/{event}/overview", {
  tag: "Organizer data",
  summary: "Organizer dashboard",
  description: `${ORGANIZERS} Headline counts, submissions per day, projects per track, per-judge progress (least progress first) and the latest audit entries.`,
  returns:
    "`{ event, phase, totals, submissionsPerDay, projectsPerTrack, judgeProgress, activity }`.",
  errors: [403],
});
op("get", "/api/events/{event}/audit", {
  tag: "Organizer data",
  summary: "Audit trail",
  description: `${ORGANIZERS} Newest first. Page backwards with \`before\` = the previous response's \`nextBefore\`.`,
  query: {
    action: { description: "Filter by action prefix, e.g. `score` or `vote.`." },
    before: {
      description: "ISO timestamp; only entries older than this.",
      schema: { type: "string", format: "date-time" },
    },
    limit: {
      description: "Page size, 1–200 (default 50).",
      schema: { ...int, minimum: 1, maximum: 200, default: 50 },
    },
  },
  returns: "`{ entries: AuditEntry[], nextBefore: string | null }`.",
  errors: [403],
});
op("get", "/api/events/{event}/export", {
  tag: "Organizer data",
  summary: "Export a dataset",
  description: `${ORGANIZERS} Spreadsheet-safe CSV by default (formula-looking cells are neutralized), JSON records with \`format=json\`. Sent as an attachment; every download is audited. 400 for an unknown dataset.`,
  query: {
    dataset: {
      description: "Which dataset (default `results`).",
      schema: { type: "string", enum: [...DATASETS], default: "results" },
    },
    format: {
      description: "`csv` (default) or `json`.",
      schema: { type: "string", enum: ["csv", "json"], default: "csv" },
    },
  },
  produces: "csv-or-json",
  returns: "`text/csv` or a JSON array of records.",
  errors: [400, 403],
});
op("get", "/api/events/{event}/bundle", {
  tag: "Organizer data",
  summary: "Download the event bundle",
  description: `${ORGANIZERS} The whole event as one portable, fixtures-compatible JSON file for backup or migration. Re-import with \`POST /api/events/import\`.`,
  returns: "The bundle (same shape as the import body), as an attachment.",
  errors: [403],
});
op("get", "/api/events/{event}/similarity", {
  tag: "Organizer data",
  summary: "Duplicate detection",
  description: `${ORGANIZERS} Every pair of submissions at or above \`threshold\`, with reasons (same repository, identical title, overlapping write-up) and the distinctive terms they share.`,
  query: {
    threshold: {
      description: "0.1–1 (default 0.5).",
      schema: { type: "number", minimum: 0.1, maximum: 1, default: 0.5 },
    },
  },
  returns: "`{ threshold, scanned, pairs: { a, b, score, reasons, sharedTerms }[] }`.",
  errors: [403],
});

/* ─────────────────────────────── Certificates ─────────────────────────────── */

op("get", "/api/events/{event}/certificates", {
  tag: "Certificates",
  summary: "List issued certificates",
  description: ORGANIZERS,
  returns: "`{ certificates: Certificate[] }`.",
  errors: [403],
});
op("post", "/api/events/{event}/certificates", {
  tag: "Certificates",
  summary: "Issue certificates",
  description: `${ORGANIZERS} \`judges\`: one per judge with at least one review, stating how many they completed. \`winners\`: one per team member per prize — 403 until results are published. Re-issuing skips people who already hold the same certificate.`,
  body: bodies.certificates,
  status: 201,
  returns: "`{ issued, serials }`.",
  errors: [403],
});
op("get", "/api/certificates/{serial}", {
  tag: "Certificates",
  access: "public",
  summary: "Verify a certificate",
  description:
    "Public verification. Recomputes the HMAC-SHA256 over the stored record; `valid: false` means it was altered after issue.",
  returns:
    "`{ serial, kind, subjectName, subjectUsername, statement, reviewsCompleted, event: { name, slug }, issuedAt, signature, algorithm, valid }`.",
});

/* ───────────────────────────────── Webhooks ───────────────────────────────── */

op("get", "/api/events/{event}/webhooks", {
  tag: "Webhooks",
  summary: "List subscriptions",
  description: `${ORGANIZERS} Secrets are redacted to a hint. Each subscription carries its 20 most recent deliveries.`,
  returns: "`{ types: string[], webhooks: (Webhook & { secretHint, deliveries })[] }`.",
  errors: [403],
});
op("post", "/api/events/{event}/webhooks", {
  tag: "Webhooks",
  summary: "Subscribe",
  description: `${ORGANIZERS} The signing secret (\`whsec_…\`) is returned once, in this response only.`,
  body: bodies.webhook,
  status: 201,
  returns: "`{ id, secret }`.",
  errors: [403],
});
op("patch", "/api/webhooks/{id}", {
  tag: "Webhooks",
  params: { id: "Webhook id." },
  summary: "Update a subscription",
  description: "Organizers of the webhook's event (platform-wide hooks: admins). 403 otherwise.",
  body: bodies.webhookPatch,
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("delete", "/api/webhooks/{id}", {
  tag: "Webhooks",
  params: { id: "Webhook id." },
  summary: "Delete a subscription",
  description: "Organizers of the webhook's event (platform-wide hooks: admins). 403 otherwise.",
  returns: "`{ ok: true }`.",
  errors: [403],
});
op("post", "/api/webhooks/{id}", {
  tag: "Webhooks",
  params: { id: "Webhook id." },
  summary: "Send a test ping",
  description:
    "Delivers a signed `ping` now and reports the receiver's answer. Same permissions as updating.",
  returns: "`{ status, ok, error }` — the receiver's HTTP status, or the network error.",
  errors: [403],
});

/* ──────────────────────────────────── Me ──────────────────────────────────── */

op("get", "/api/me", {
  tag: "Me",
  summary: "My account",
  description: "The caller's account and profile.",
  returns:
    "`{ user: { id, name, email, role, username, image, headline, bio, location, websiteUrl, githubUrl, skills, lookingForTeam, createdAt } }`.",
});
op("patch", "/api/me", {
  tag: "Me",
  summary: "Edit my profile",
  description: "Only the fields sent change. 409 if the username is taken.",
  body: bodies.me,
  returns: "`{ user }`.",
  errors: [409],
});
op("get", "/api/me/overview", {
  tag: "Me",
  summary: "My dashboard",
  description:
    "Events joined (with team), projects, judging queues with progress, events organized and certificates held.",
  returns: "The dashboard overview object.",
});
op("get", "/api/me/tokens", {
  tag: "Me",
  summary: "List API tokens",
  description: "The caller's personal API tokens — never the secret itself.",
  returns: "`{ tokens: { id, label, prefix, createdAt, lastUsedAt }[] }`.",
});
op("post", "/api/me/tokens", {
  tag: "Me",
  summary: "Create an API token",
  description:
    "Mints a `jz_…` token. It is shown once; only its SHA-256 hash is stored. Use it as `Authorization: Bearer <token>`.",
  body: bodies.token,
  status: 201,
  returns: "`{ id, token }`.",
});
op("delete", "/api/me/tokens", {
  tag: "Me",
  summary: "Revoke an API token",
  description: "404 unless the token belongs to the caller.",
  query: { id: { description: "Token id.", required: true } },
  returns: "`{ ok: true }`.",
  errors: [404],
});

/* ─────────────────────────────── Users & admin ─────────────────────────────── */

op("get", "/api/users/{username}", {
  tag: "Users",
  access: "public",
  summary: "Public profile",
  description:
    "Bio, skills, links, submitted projects, judging panels and certificates. No email address is exposed.",
  returns: "The public profile object.",
});
op("get", "/api/admin/users", {
  tag: "Admin",
  summary: "List accounts",
  description: "Requires the `admin` role (403 otherwise). 50 per page, newest first.",
  query: {
    q: { description: "Search name, email and username." },
    role: {
      description: "Filter by role.",
      schema: { type: "string", enum: ["participant", "judge", "organizer", "admin"] },
    },
    page: { description: "Zero-based page.", schema: { ...int, minimum: 0, default: 0 } },
  },
  returns: "`{ users, total, page, pageSize }`.",
  errors: [403],
});
op("patch", "/api/admin/users/{id}", {
  tag: "Admin",
  params: { id: "User id." },
  summary: "Change role or suspend",
  description:
    "Requires the `admin` role. Suspending signs the user out everywhere. 400 when targeting yourself, so an instance always keeps an admin.",
  body: bodies.adminUser,
  returns: "`{ ok: true }`.",
  errors: [403],
});

/* ────────────────────────────────── System ────────────────────────────────── */

op("get", "/api/health", {
  tag: "System",
  access: "public",
  summary: "Health check",
  description: "Liveness and database readiness, for container healthchecks and uptime monitors.",
  returns: "`{ ok: true, time }`.",
  errors: [503],
});
op("get", "/api/openapi.json", {
  tag: "System",
  access: "public",
  summary: "This document",
  description:
    "The OpenAPI 3.1 description of the API, served with `Access-Control-Allow-Origin: *` so any tool can load it.",
  returns: "The OpenAPI document.",
});

/* ─────────────────────────────── Webhook payloads ─────────────────────────────── */

const WEBHOOK_DATA: Record<(typeof WEBHOOK_EVENTS)[number] | "ping", [string, Json]> = {
  ping: ["Sent by `POST /api/webhooks/{id}`.", { message: str }],
  "event.created": ["An event was created.", { name: str, slug: str }],
  "event.updated": ["Event settings changed.", { fields: { type: "array", items: str } }],
  "team.created": ["A team was formed.", { teamId: str, name: str }],
  "team.join_requested": [
    "A participant requested to join an Innolab project.",
    { teamId: str, userId: str, projectId: str },
  ],
  "team.joined": ["Someone joined a team.", { teamId: str, userId: str }],
  "project.submitted": ["A project was submitted.", { projectId: str, title: str }],
  "project.updated": ["A project was edited.", { projectId: str }],
  "judge.invited": ["A judging invitation link was created.", { email: str }],
  "judge.joined": ["A judge joined the panel.", { userId: str }],
  "assignments.generated": [
    "Judge assignments were generated.",
    { strategy: str, reviewsPerProject: int, judges: int, pairs: int, inserted: int },
  ],
  "score.saved": ["A judge saved a score.", { projectId: str, judgeId: str }],
  "vote.cast": ["A community vote changed.", { projectId: str }],
  "comment.posted": ["A comment was posted.", { projectId: str, commentId: str }],
  "results.published": ["Results were published.", { name: str, slug: str }],
  "certificate.issued": [
    "Certificates were issued.",
    { kind: str, serials: { type: "array", items: str } },
  ],
};

const webhooks = Object.fromEntries(
  Object.entries(WEBHOOK_DATA).map(([type, [summary, data]]) => [
    type,
    {
      post: {
        summary,
        description:
          "Verify `X-Juryza-Signature` before trusting the body. Answer with any 2xx within 5 seconds.",
        parameters: [
          { name: "X-Juryza-Event", in: "header", required: true, schema: { const: type } },
          {
            name: "X-Juryza-Signature",
            in: "header",
            required: true,
            description:
              "`sha256=<hex>` — HMAC-SHA256 of the raw body keyed with the subscription secret.",
            schema: str,
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "sentAt", "data"],
                properties: {
                  type: { const: type },
                  sentAt: { type: "string", format: "date-time" },
                  data: {
                    type: "object",
                    properties: { eventId: { type: ["string", "null"] }, ...data },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Any 2xx acknowledges the delivery." } },
      },
    },
  ])
);

/* ────────────────────────────────── Document ────────────────────────────────── */

const errorResponse = (description: string, schema: "Error" | "RateLimitError" = "Error") => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
});

const DESCRIPTION = `The REST API behind every screen in Juryza — anything the app does, a script can do.

## Authentication
Create a personal token at **/settings/tokens** (or \`POST /api/me/tokens\`) and send it on every request:

    Authorization: Bearer jz_…

Browsers use the Better Auth session cookie instead (\`POST /api/auth/sign-in/email\`). Authorization is enforced by the server on every call, whatever the UI shows: each operation lists who may call it.

## Errors
Failures return JSON \`{ "error": "Human-readable message" }\` with the HTTP status. Validation failures (400) add \`issues\`, the Zod issue list with the offending \`path\`.

## Rate limits
Voting, commenting, voter verification and sign-in are rate limited. A 429 carries \`retryAfterSeconds\`.

## Webhooks
Organizers subscribe with \`POST /api/events/{event}/webhooks\`. Each delivery is a POST of \`{ type, sentAt, data }\` with headers \`X-Juryza-Event\` and \`X-Juryza-Signature: sha256=<hex>\` — an HMAC-SHA256 of the raw body keyed with the subscription secret. Compare it in constant time before trusting the payload. Types: ${WEBHOOK_EVENTS.map((t) => `\`${t}\``).join(", ")}.`;

let cached: Json | null = null;

export function openApiDocument(): Json {
  cached ??= {
    openapi: "3.1.0",
    info: {
      title: "Juryza API",
      version: "1.0.0",
      description: DESCRIPTION,
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: "/", description: "This Juryza instance" }],
    tags: Object.entries(TAGS).map(([name, description]) => ({ name, description })),
    paths,
    webhooks,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "jz_…",
          description: "Personal API token from /settings/tokens: `Authorization: Bearer jz_…`.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Better Auth session cookie set by `POST /api/auth/sign-in/email`.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string", description: "Human-readable message." },
            issues: {
              type: "array",
              description: "Validation issues (400 only).",
              items: {
                type: "object",
                properties: { path: { type: "array", items: {} }, message: str, code: str },
              },
            },
          },
        },
        RateLimitError: {
          type: "object",
          required: ["error"],
          properties: {
            error: str,
            retryAfterSeconds: { ...int, description: "Seconds until the window resets." },
          },
        },
      },
      responses: {
        E400: errorResponse("Invalid request — the body failed validation or broke a rule."),
        E401: errorResponse("No valid credential: sign in or send a bearer token."),
        E403: errorResponse("Authenticated, but not allowed to do this."),
        E404: errorResponse("Not found (or not visible to the caller)."),
        E409: errorResponse("Conflicts with existing state."),
        E429: errorResponse("Rate limited. Retry after `retryAfterSeconds`.", "RateLimitError"),
        E503: errorResponse("A dependency (the database) is unavailable."),
      },
    },
  };
  return cached;
}
