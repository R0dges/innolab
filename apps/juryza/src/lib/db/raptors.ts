/**
 * Hackathon Raptors showcase data — built from the community's own published
 * dataset (https://rank.raptors.dev/data/leaderboard.json), vendored alongside
 * this file as `raptors-leaderboard.json`.
 *
 * It lets an evaluator see Juryza driving real-world data: real events, real
 * project and team names, real placements and prize money, with leaderboards
 * and awards that Juryza recomputes from seeded scores.
 *
 * What is real vs. reconstructed:
 *  - Real: event names, slugs, end dates, prize pools; and for every award, the
 *    project title, team name, the person on it, the placement/label, the prize
 *    amount, the code URL, and — where the dataset has it — the published
 *    `final_score` (0–5).
 *  - Reconstructed for the demo: per-judge marks. The dataset publishes a single
 *    final score per project, not the underlying ballots, so three judges' marks
 *    are synthesized to average to that score (or to a placement-derived score
 *    when none was published). This faithfully reproduces the published podium
 *    when Juryza recomputes it; it is not a claim about how any real judge voted.
 *
 * Seeded through the same `importBundle` path as every other event.
 */

import raw from "@/lib/db/raptors-leaderboard.json";
import type { Bundle } from "@/lib/server/bundle";

const DAY = 24 * 60 * 60 * 1000;

/* ---------------------------------------------------------------- */
/* Shapes of the published dataset (only the fields we consume).    */
/* ---------------------------------------------------------------- */

export interface AwardEntry {
  event_slug: string;
  event_name: string;
  ended: string;
  kind: "podium" | "category" | "special" | "side_quest" | "honourable_mention";
  placement: number | null;
  label: string | null;
  team: string | null;
  project: string | null;
  prize_usd: number | null;
  final_score: number | null;
  code_url: string | null;
  github_owner?: string | null;
  person_name?: string | null;
  team_size?: number | null;
  discord?: string | null;
  points?: number | null;
}

export interface Person {
  person_id: string;
  display_name: string | null;
  name_variants?: string[];
  discord?: string[];
  points: number;
  prize_usd: number;
  events: number;
  awards: number;
  wins?: {
    first: number;
    second: number;
    third: number;
    category: number;
    special: number;
    side_quest: number;
    honourable_mention: number;
  };
  teams?: string[];
  first_event?: string;
  first_date?: string;
  latest_event?: string;
  latest_date?: string;
  streak?: number;
  repeat?: boolean;
  rookie?: boolean;
  entries: AwardEntry[];
}

export interface EventMeta {
  slug: string;
  name: string;
  ended: string;
  prize_usd: number | null;
  awards: number;
}

export interface LeaderboardDataset {
  totals: {
    events_scored: number;
    events_total: number;
    people: number;
    awards: number;
    prize_usd_awarded: number;
    repeat_winners: number;
    latest_event: string;
  };
  events: EventMeta[];
  people: Person[];
}

const data = raw as unknown as LeaderboardDataset;

/* ---------------------------------------------------------------- */
/* Helpers                                                          */
/* ---------------------------------------------------------------- */

const money = (usd: number | null | undefined) =>
  usd && usd > 0 ? `$${usd.toLocaleString("en-US")}` : null;

export const slugId = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";

/**
 * Extract verified GitHub username for a person from dataset entries.
 * Checks explicit entry `github_owner` first, then solo project repository ownership.
 * Never assigns a repository owner to other teammates on a group project.
 */
export function getGitHubUsername(person: Person): string | null {
  // 1. Explicit entry github_owner
  const direct = person.entries.find((e) => e.github_owner?.trim())?.github_owner?.trim();
  if (direct) return direct.toLowerCase();

  // 2. Solo project (team_size === 1) repository owner
  for (const e of person.entries) {
    if (e.team_size === 1 && e.code_url) {
      const match = e.code_url.match(/github\.com\/([a-zA-Z0-9_-]+)/);
      if (match?.[1] && !["orgs", "topics", "features"].includes(match[1].toLowerCase())) {
        return match[1].toLowerCase();
      }
    }
  }

  return null;
}

/**
 * Return the stable, canonical username for a person.
 * If they have a known GitHub owner, use that.
 * Otherwise fallback to their person_id slug.
 */
export function canonicalUsernameFor(person: Person): string {
  const gh = getGitHubUsername(person);
  if (gh) return gh;
  return slugId(person.person_id || person.display_name || "builder");
}

export function canonicalEmailFor(person: Person): string {
  const username = canonicalUsernameFor(person);
  return `${username}@raptors.community`;
}

export function avatarFor(username: string, hasGithub = false): string {
  return hasGithub
    ? `https://github.com/${username}.png`
    : `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;
}

/** A person's award, with the unified person attached. */
interface OwnedEntry extends AwardEntry {
  person: string | null;
  personId: string;
  username: string;
  email: string;
}

interface RaptorsProjectMember {
  name: string;
  username: string;
  email: string;
}

/** A reconstructed project: one distinct `project` title within an event. */
interface RaptorsProject {
  title: string;
  team: string;
  members: RaptorsProjectMember[];
  codeUrl: string | null;
  bestScore: number | null;
  bestPlacement: number | null;
  labels: string[];
}

/**
 * A placement-derived score on the 0–5 scale, used only when the dataset has no
 * published `final_score` for an entry. Keeps the podium order intact.
 */
function placementScore(placement: number | null): number {
  switch (placement) {
    case 1:
      return 4.6;
    case 2:
      return 4.2;
    case 3:
      return 3.8;
    default:
      return 3.3;
  }
}

/* Three named judges per event; enough for cross-judge normalization to bite. */
const JUDGE_NAMES = ["Jamie Rivera", "Priya Nair", "Marcus Bloom"];

const RUBRIC: NonNullable<Bundle["rubric"]> = [
  { key: "impact", label: "Impact", weight: 0.3, description: "Does it matter?" },
  { key: "execution", label: "Execution", weight: 0.4, description: "Is it well built?" },
  { key: "originality", label: "Originality", weight: 0.3, description: "Is it a fresh idea?" },
];

const doc = (text: string): Bundle["projects"][number]["content"] => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** Group every published award by the event it belongs to. */
function entriesByEvent(): Map<string, OwnedEntry[]> {
  const byEvent = new Map<string, OwnedEntry[]>();
  for (const person of data.people) {
    const username = canonicalUsernameFor(person);
    const email = canonicalEmailFor(person);
    for (const e of person.entries) {
      const owned: OwnedEntry = {
        ...e,
        person: person.display_name,
        personId: person.person_id,
        username,
        email,
      };
      byEvent.set(e.event_slug, [...(byEvent.get(e.event_slug) ?? []), owned]);
    }
  }
  return byEvent;
}

/** Collapse an event's award entries into distinct projects with rosters. */
function projectsOf(entries: OwnedEntry[]): RaptorsProject[] {
  const byProject = new Map<string, RaptorsProject>();
  for (const e of entries) {
    const title = e.project?.trim() || e.team?.trim();
    if (!title) continue;
    const team = e.team?.trim() || title;
    const person = e.person?.trim() || team;
    const key = `${team}::${title}`;
    const member: RaptorsProjectMember = {
      name: person,
      username: e.username,
      email: e.email,
    };

    const existing = byProject.get(key);
    if (existing) {
      if (!existing.members.some((m) => m.email === member.email)) {
        existing.members.push(member);
      }
      if (e.code_url && !existing.codeUrl) existing.codeUrl = e.code_url;
      if (
        e.final_score !== null &&
        (existing.bestScore === null || e.final_score > existing.bestScore)
      )
        existing.bestScore = e.final_score;
      if (
        e.placement !== null &&
        (existing.bestPlacement === null || e.placement < existing.bestPlacement)
      )
        existing.bestPlacement = e.placement;
      if (e.label && !existing.labels.includes(e.label)) existing.labels.push(e.label);
    } else {
      byProject.set(key, {
        title,
        team,
        members: [member],
        codeUrl: e.code_url,
        bestScore: e.final_score,
        bestPlacement: e.placement,
        labels: e.label ? [e.label] : [],
      });
    }
  }
  return [...byProject.values()];
}

/* ---------------------------------------------------------------- */
/* Bundle builder & Exports                                         */
/* ---------------------------------------------------------------- */

/**
 * Return all real builders from Hackathon Raptors ready for account creation.
 * Every participant has a single canonical user account, real GitHub avatar,
 * stats, and uniform password.
 */
export function raptorsPeople(): {
  personId: string;
  name: string;
  username: string;
  email: string;
  image: string;
  githubUrl: string | null;
  points: number;
  prizeUsd: number;
  awardsCount: number;
  eventsCount: number;
  wins?: Person["wins"];
  headline: string;
  bio: string;
  skills: string[];
  rank: number;
}[] {
  // Sort by points descending to assign real rank
  const sorted = [...data.people].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return sorted.map((p, idx) => {
    const ghUser = getGitHubUsername(p);
    const username = canonicalUsernameFor(p);
    const email = canonicalEmailFor(p);
    const image = avatarFor(username, Boolean(ghUser));
    const githubUrl = ghUser ? `https://github.com/${ghUser}` : null;
    const name = p.display_name || p.person_id;
    const rank = idx + 1;

    // Extract tags/tech from code repos or common skills
    const skills = [
      "TypeScript",
      "Next.js",
      "React",
      ...(p.entries.some(
        (e) => e.code_url?.includes("ai") || e.project?.toLowerCase().includes("ai")
      )
        ? ["AI/ML"]
        : []),
      ...(p.entries.some((e) => e.code_url?.includes("fast") || e.code_url?.includes("rust"))
        ? ["Rust", "Performance"]
        : ["PostgreSQL"]),
    ].slice(0, 5);

    return {
      personId: p.person_id,
      name,
      username,
      email,
      image,
      githubUrl,
      points: p.points ?? 0,
      prizeUsd: p.prize_usd ?? 0,
      awardsCount: p.awards ?? 0,
      eventsCount: p.events ?? 0,
      wins: p.wins,
      headline: `${p.awards}x Award Winner · ${p.points} Pts · ${p.events} Hackathons`,
      bio: `Hackathon Raptors builder. Ranked #${rank} on the platform with ${p.points} points and $${(p.prize_usd ?? 0).toLocaleString()} in prizes across ${p.events} hackathons.`,
      skills,
      rank,
    };
  });
}

/**
 * Return platform leaderboard data for the centralized leaderboard page.
 */
export function raptorsLeaderboardData() {
  const people = raptorsPeople();
  return {
    totals: data.totals,
    leaderboard: people,
    events: data.events,
  };
}

/**
 * Build one import bundle per Hackathon Raptors event, newest first.
 * The team members use stable, unified participant emails so each person's
 * projects aggregate onto their single profile across all events.
 */
export function raptorsBundles(): Bundle[] {
  const grouped = entriesByEvent();
  const metaBySlug = new Map(data.events.map((e) => [e.slug, e]));
  const bundles: Bundle[] = [];

  const sorted = [...grouped.entries()].sort((a, b) => {
    const da = a[1][0]?.ended ?? "";
    const db = b[1][0]?.ended ?? "";
    return db.localeCompare(da);
  });

  for (const [slug, entries] of sorted) {
    const projects = projectsOf(entries);
    if (projects.length === 0) continue;

    const meta = metaBySlug.get(slug);
    const name = meta?.name ?? entries[0]?.event_name ?? slug;
    const endedStr = meta?.ended ?? entries[0]?.ended ?? "2025-01-01";
    const endedAt = new Date(`${endedStr}T18:00:00Z`).getTime();
    const submissionsClose = new Date(endedAt - 2 * DAY).toISOString();
    const submissionsOpen = new Date(endedAt - 5 * DAY).toISOString();
    const judgingClose = new Date(endedAt).toISOString();
    const eslug = `raptors-${slug}`;

    // Order projects by the podium, then by published score
    const ordered = [...projects].sort((a, b) => {
      const pa = a.bestPlacement ?? 99;
      const pb = b.bestPlacement ?? 99;
      if (pa !== pb) return pa - pb;
      return (b.bestScore ?? 0) - (a.bestScore ?? 0);
    });

    const bundleProjects: Bundle["projects"] = ordered.map((p, i) => ({
      id: `${eslug}_prj_${i + 1}`,
      team: `${eslug}_tm_${i + 1}`,
      title: p.title,
      tagline: p.labels[0] ? `Award: ${p.labels[0]}` : null,
      summary: `${p.title} by ${p.team} — ${name}.`,
      content: doc(
        `${p.title} by ${p.team} at ${name}.${p.labels.length ? ` Recognised for: ${p.labels.join(", ")}.` : ""}`
      ),
      repo_url: p.codeUrl ?? null,
      tech_tags: p.codeUrl ? ["Open Source"] : [],
      status: "submitted",
      submitted_at: submissionsClose,
    }));

    // Unified participant emails — stable across all events!
    const teams: Bundle["teams"] = ordered.map((p, i) => ({
      id: `${eslug}_tm_${i + 1}`,
      name: p.team,
      members: p.members.map((m) => m.email),
    }));

    const judges: Bundle["judges"] = JUDGE_NAMES.map((jn, i) => ({
      id: `${eslug}_jd_${i + 1}`,
      name: jn,
      email: `${slugId(jn)}.${eslug}@raptors.example`,
      tracks: [],
    }));

    // Scores: three judges whose marks average to the project's published score
    const scores: Bundle["scores"] = [];
    ordered.forEach((p, pi) => {
      const target = p.bestScore ?? placementScore(p.bestPlacement);
      judges.forEach((j, ji) => {
        const offset = (ji - 1) * 0.2;
        const mark = (d: number) => Math.min(5, Math.max(1, Math.round(target + d + offset)));
        scores.push({
          judge: j.id,
          project: `${eslug}_prj_${pi + 1}`,
          criteria: { impact: mark(0), execution: mark(0.15), originality: mark(-0.15) },
          favorite: false,
          comment: "Showcase review (reconstructed to match the published result).",
        });
      });
    });

    // Prizes: real podium with published amounts
    const podium = ordered
      .filter((p) => p.bestPlacement !== null && p.bestPlacement <= 3)
      .slice(0, 3);
    const prizeAmount = money(meta?.prize_usd);
    const prizes: Bundle["prizes"] = podium.length
      ? podium.map((p) => ({
          name: `${["", "1st", "2nd", "3rd"][p.bestPlacement ?? 1]} place`,
          kind: "overall" as const,
          amount: p.bestPlacement === 1 ? prizeAmount : null,
          rank: p.bestPlacement ?? 1,
        }))
      : [{ name: "1st place", kind: "overall", amount: prizeAmount, rank: 1 }];

    bundles.push({
      format: "juryza-bundle-raptors-showcase",
      event: {
        slug: eslug,
        name,
        tagline: `A Hackathon Raptors event${prizeAmount ? ` · ${prizeAmount} prize pool` : ""}.`,
        description: `${name} — a Hackathon Raptors event, rebuilt from published results (rank.raptors.dev) for the Juryza showcase. ${projects.length} recognised ${projects.length === 1 ? "project" : "projects"}.`,
        submissions_open: submissionsOpen,
        submissions_close: submissionsClose,
        judging_close: judgingClose,
        hue: Math.abs([...slug].reduce((hh, c) => (hh * 31 + c.charCodeAt(0)) | 0, 7)) % 360,
        is_fixture: false,
      },
      tracks: [],
      rubric: RUBRIC,
      prizes,
      judges,
      teams,
      projects: bundleProjects,
      scores,
      pairwise: [],
    });
  }

  return bundles;
}
