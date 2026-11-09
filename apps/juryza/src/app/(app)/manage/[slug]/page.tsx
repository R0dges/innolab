"use client";

/**
 * /manage/<slug> — the event's live overview: headline KPIs, a "next steps"
 * checklist computed from the event's state, submissions per day, projects
 * per track, per-judge progress (least done first), the lifecycle timeline and
 * the latest audit activity.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FilePen,
  FolderCheck,
  Gavel,
  ListChecks,
  MessageSquare,
  ScrollText,
  UserRound,
  UsersRound,
  Vote,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@juryza/ui/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@juryza/ui/components/ui/empty";
import { Progress } from "@juryza/ui/components/ui/progress";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@juryza/ui/components/ui/table";
import { cn } from "@juryza/ui/lib/utils";

import { Timeline } from "@/components/event-bits";
import { StatCard } from "@/components/page";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatNumber, relativeTime } from "@/lib/format";
import { EVENT_REWARDS_ENABLED, EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { type EventDetail, eventKey, useEvent } from "@/lib/queries";
import type { AuditLog, Event, Json } from "@/lib/types";

interface Overview {
  event: Json<Event>;
  phase: string;
  totals: {
    registrations: number;
    teams: number;
    submitted: number;
    drafts: number;
    judges: number;
    assignments: number;
    scores: number;
    voters: number;
    comments: number;
  };
  submissionsPerDay: { day: string; n: number }[];
  projectsPerTrack: { trackId: string; name: string; n: number }[];
  judgeProgress: {
    judgeId: string;
    name: string;
    username: string | null;
    assigned: number;
    scored: number;
  }[];
  activity: Json<AuditLog>[];
}

const countConfig = { n: { label: "Projects", color: "var(--chart-1)" } } satisfies ChartConfig;

export default function EventOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useEvent(slug);
  const { data, isLoading, error } = useQuery({
    queryKey: [...eventKey(slug), "overview"],
    queryFn: () => api.get<Overview>(`/api/events/${slug}/overview`),
  });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load the overview</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const t = data.totals;
  const base = `/manage/${slug}`;
  const scoredPct = t.assignments ? Math.min(100, Math.round((t.scores / t.assignments) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Participants"
          value={formatNumber(t.registrations)}
          icon={UsersRound}
          hint="Registered for the event"
        />
        <StatCard
          label="Teams"
          value={formatNumber(t.teams)}
          icon={UsersRound}
          hint="Formed so far"
        />
        <StatCard
          label="Submitted"
          value={formatNumber(t.submitted)}
          icon={FolderCheck}
          hint={t.teams ? `from ${t.teams} team${t.teams === 1 ? "" : "s"}` : "Final submissions"}
        />
        <StatCard
          label="Drafts"
          value={formatNumber(t.drafts)}
          icon={FilePen}
          hint="Started, not yet submitted"
        />
        <StatCard label="Judges" value={formatNumber(t.judges)} icon={Gavel} hint="On the panel" />
        <StatCard
          label="Scores given"
          value={
            <span>
              {formatNumber(t.scores)}
              <span className="text-muted-foreground text-base font-normal">
                {" "}
                / {formatNumber(t.assignments)}
              </span>
            </span>
          }
          icon={ListChecks}
          hint={
            t.assignments ? (
              <Progress
                value={scoredPct}
                className="mt-1.5"
                aria-label={`${scoredPct}% of assignments scored`}
              />
            ) : (
              "No assignments yet"
            )
          }
        />
        <StatCard
          label="Voters"
          value={formatNumber(t.voters)}
          icon={Vote}
          hint="Distinct community voters"
        />
        <StatCard
          label="Comments"
          value={formatNumber(t.comments)}
          icon={MessageSquare}
          hint="On project pages"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <SubmissionsChart data={data.submissionsPerDay} total={t.submitted} />
          {EVENT_TRACKS_ENABLED && (
            <TracksChart data={data.projectsPerTrack} manageHref={`${base}/tracks`} />
          )}
        </div>
        <NextSteps overview={data} detail={detail.data} base={base} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <JudgeProgress rows={data.judgeProgress} base={base} />
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>Key dates, in your timezone.</CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`${base}/settings`} />}
              >
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pl-8">
            <Timeline event={data.event} />
          </CardContent>
        </Card>
      </div>

      <Activity rows={data.activity} auditHref={`${base}/audit`} />
    </div>
  );
}

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

/** Fill the days with no submissions between the first and the last one. */
function fillDays(rows: { day: string; n: number }[]) {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return [];
  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  const out: { day: string; label: string; n: number }[] = [];
  const end = new Date(`${last.day}T00:00:00Z`).getTime();
  for (
    let d = new Date(`${first.day}T00:00:00Z`).getTime();
    d <= end && out.length < 120;
    d += 86_400_000
  ) {
    const key = new Date(d).toISOString().slice(0, 10);
    out.push({ day: key, label: dayLabel(key), n: byDay.get(key) ?? 0 });
  }
  return out;
}

function SubmissionsChart({ data, total }: { data: { day: string; n: number }[]; total: number }) {
  const days = fillDays(data);
  const peak = days.reduce((best, d) => (d.n > (best?.n ?? -1) ? d : best), days[0]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Submissions per day</CardTitle>
        <CardDescription>
          {days.length ? (
            <>
              {formatNumber(total)} submitted · peak {peak?.label} ({formatNumber(peak?.n ?? 0)})
            </>
          ) : (
            "Nothing submitted yet"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {days.length ? (
          <ChartContainer config={countConfig} className="aspect-auto h-56 w-full">
            <BarChart data={days} margin={{ top: 16, left: -16, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<ChartTooltipContent />} />
              <Bar dataKey="n" fill="var(--color-n)" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {days.length <= 14 && (
                  <LabelList
                    dataKey="n"
                    position="top"
                    className="fill-muted-foreground"
                    fontSize={11}
                  />
                )}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart text="The chart fills in as teams submit." />
        )}
      </CardContent>
    </Card>
  );
}

function TracksChart({
  data,
  manageHref,
}: {
  data: { name: string; n: number }[];
  manageHref: string;
}) {
  const rows = [...data].sort((a, b) => b.n - a.n);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects per track</CardTitle>
        <CardDescription>Submitted projects only.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ChartContainer
            config={countConfig}
            className="aspect-auto w-full"
            style={{ height: Math.max(160, rows.length * 30 + 16) }}
          >
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 28 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={120}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<ChartTooltipContent />} />
              <Bar dataKey="n" fill="var(--color-n)" radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList dataKey="n" position="right" className="fill-foreground" fontSize={11} />
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart
            text="This event has no tracks."
            action={
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={manageHref} />}
              >
                Add tracks
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm">
      {text}
      {action}
    </div>
  );
}

function NextSteps({
  overview,
  detail,
  base,
}: {
  overview: Overview;
  detail: EventDetail | undefined;
  base: string;
}) {
  const t = overview.totals;
  const e = overview.event;
  const steps = [
    {
      label: "Publish the event",
      hint: "Make the public page visible",
      done: e.visibility === "published",
      href: `${base}/settings`,
    },
    ...(EVENT_TRACKS_ENABLED
      ? [
          {
            label: "Add tracks",
            hint: "Categories projects compete in",
            done: (detail?.tracks.length ?? 0) > 0,
            href: `${base}/tracks`,
          },
        ]
      : []),
    ...(EVENT_REWARDS_ENABLED
      ? [
          {
            label: "Set up prizes",
            hint: "Overall or community rewards",
            done: (detail?.prizes.length ?? 0) > 0,
            href: `${base}/tracks`,
          },
        ]
      : []),
    {
      label: "Configure the rubric",
      hint: "Weighted scoring criteria",
      done: (detail?.criteria.length ?? 0) > 0,
      href: `${base}/rubric`,
    },
    {
      label: "Invite judges",
      hint: "Build the judging panel",
      done: t.judges > 0,
      href: `${base}/judges`,
    },
    {
      label: "Receive submissions",
      hint: "Teams submit their projects",
      done: t.submitted > 0,
      href: `${base}/submissions`,
    },
    {
      label: "Generate assignments",
      hint: "Distribute projects to judges",
      done: t.assignments > 0,
      href: `${base}/assignments`,
    },
    {
      label: "Collect every score",
      hint: `${formatNumber(t.scores)} of ${formatNumber(t.assignments)} reviews in`,
      done: t.assignments > 0 && t.scores >= t.assignments,
      href: `${base}/assignments`,
    },
    {
      label: "Publish results",
      hint: "Announce the winning project and open its Wall of Fame",
      done: e.resultsPublished,
      href: `${base}/results`,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Next steps</CardTitle>
        <CardDescription>
          {done} of {steps.length} complete
        </CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-sm font-medium tabular-nums">
            {Math.round((done / steps.length) * 100)}%
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={(done / steps.length) * 100} aria-label="Setup progress" />
        <ul className="-mx-2 flex flex-col">
          {steps.map((s, i) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className={cn(
                  "group hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-2",
                  i === nextIdx && "bg-muted/60"
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="text-success size-4 shrink-0" aria-label="Done" />
                ) : (
                  <Circle className="text-muted-foreground size-4 shrink-0" aria-label="To do" />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      s.done ? "text-muted-foreground line-through decoration-1" : "font-medium"
                    )}
                  >
                    {s.label}
                  </span>
                  {!s.done && (
                    <span className="text-muted-foreground block truncate text-xs">{s.hint}</span>
                  )}
                </span>
                {i === nextIdx && <Badge variant="secondary">Next</Badge>}
                <ArrowRight className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function JudgeProgress({ rows, base }: { rows: Overview["judgeProgress"]; base: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);
  const notStarted = rows.filter((r) => r.assigned > 0 && r.scored === 0).length;
  const finished = rows.filter((r) => r.assigned > 0 && r.scored >= r.assigned).length;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Judging progress</CardTitle>
        <CardDescription>
          {rows.length
            ? `${finished} of ${rows.length} judges finished · ${notStarted} not started · least done first`
            : "No judges on the panel yet."}
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={`${base}/assignments`} />}
          >
            Assignments <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judge</TableHead>
                    <TableHead className="w-2/5">Progress</TableHead>
                    <TableHead className="text-right">Scored</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => {
                    const pct = r.assigned
                      ? Math.min(100, Math.round((r.scored / r.assigned) * 100))
                      : 0;
                    return (
                      <TableRow key={r.judgeId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserAvatar name={r.name} className="size-6" />
                            <span className="truncate font-medium">{r.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Progress value={pct} aria-label={`${r.name}: ${pct}%`} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(r.scored)} / {formatNumber(r.assigned)}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.assigned === 0 ? (
                            <Badge variant="outline">Unassigned</Badge>
                          ) : r.scored === 0 ? (
                            <Badge variant="destructive">Not started</Badge>
                          ) : r.scored >= r.assigned ? (
                            <Badge variant="secondary" className="text-success">
                              <CheckCircle2 /> Done
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="tabular-nums">
                              {pct}%
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {rows.length > 8 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                onClick={() => setAll((v) => !v)}
              >
                {all ? "Show fewer" : `Show all ${rows.length} judges`}
              </Button>
            )}
          </div>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No judges yet</EmptyTitle>
              <EmptyDescription>
                Invite judges, then generate assignments to track their progress here.
              </EmptyDescription>
            </EmptyHeader>
            <Button size="sm" nativeButton={false} render={<Link href={`${base}/judges`} />}>
              <Gavel /> Invite judges
            </Button>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "event.created": "created the event",
  "event.updated": "updated event details",
  "event.imported": "imported the event",
  "tracks.updated": "updated event configuration",
  "prizes.updated": "updated the prizes",
  "rubric.updated": "updated the rubric",
  "announcement.posted": "posted an announcement",
  "announcement.deleted": "deleted an announcement",
  "assignments.generated": "generated judge assignments",
  "assignments.cleared": "cleared judge assignments",
  "certificates.issued": "issued certificates",
  "comment.posted": "commented on a project",
  "export.downloaded": "downloaded an export",
  "export.bundle": "downloaded the full bundle",
  "judge.added": "added a judge",
  "judge.invited": "invited a judge",
  "judge.invite_revoked": "revoked a judge invite",
  "judge.joined": "joined the judging panel",
  "judge.removed": "removed a judge",
  "judge.tracks_updated": "changed a judge's assignment scope",
  "judge.scores.denied": "was denied access to scores",
  "pairwise.compared": "made a pairwise comparison",
  "project.deleted": "deleted a project",
  "registration.created": "registered",
  "registration.withdrawn": "withdrew registration",
  "score.saved": "scored a project",
  "submission.rejected.closed": "tried to submit after the deadline",
  "team.created": "created a team",
  "team.disbanded": "disbanded a team",
  "team.invite_reset": "reset a team invite link",
  "team.joined": "joined a team",
  "project.join_requested": "requested to join a project",
  "project.join_approved": "approved a project join request",
  "project.join_rejected": "rejected a project join request",
  "project.join_cancelled": "cancelled a project join request",
  "team.updated": "updated a team",
  "vote.cast": "cast a community vote",
  "vote.blocked.ip_cap": "was blocked by the per-IP vote cap",
  "voter.code_sent": "requested a voting code",
  "voter.verified": "verified as a voter",
  "webhook.created": "added a webhook",
  "webhook.updated": "updated a webhook",
  "webhook.deleted": "deleted a webhook",
};

function describe(a: Json<AuditLog>) {
  const label = ACTION_LABEL[a.action] ?? a.action.replace(/[._]/g, " ");
  const d = a.detail ?? {};
  if (a.action === "announcement.posted" && typeof d.title === "string")
    return `${label} “${d.title}”`;
  if (a.action === "export.downloaded" && a.target)
    return `${label} (${a.target}${typeof d.format === "string" ? `, ${d.format}` : ""})`;
  if (a.action === "event.updated" && Array.isArray(d.fields))
    return `${label} (${d.fields.join(", ")})`;
  if (
    (a.action === "tracks.updated" || a.action === "prizes.updated") &&
    typeof d.count === "number"
  )
    return `${label} (${d.count})`;
  return label;
}

const isWarning = (action: string) =>
  action.includes("denied") || action.includes("blocked") || action.includes("rejected");

function Activity({ rows, auditHref }: { rows: Json<AuditLog>[]; auditHref: string }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>The latest entries from the audit log.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={auditHref} />}>
            <ScrollText /> Full audit log
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ol className="flex flex-col">
            {rows.map((a) => (
              <li key={a.id} className="flex items-start gap-3 border-b py-2.5 last:border-b-0">
                {a.actorName ? (
                  <UserAvatar name={a.actorName} className="size-7" />
                ) : (
                  <span className="bg-muted grid size-7 shrink-0 place-items-center rounded-full">
                    <UserRound className="text-muted-foreground size-3.5" />
                  </span>
                )}
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{a.actorName ?? "Someone"}</span>{" "}
                  <span
                    className={cn(
                      isWarning(a.action) ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {describe(a)}
                  </span>
                  {a.actorRole && a.actorRole !== "participant" && (
                    <Badge variant="outline" className="ml-2 align-middle capitalize">
                      {a.actorRole}
                    </Badge>
                  )}
                </p>
                <time
                  dateTime={a.createdAt}
                  className="text-muted-foreground shrink-0 text-xs tabular-nums"
                  title={a.createdAt}
                >
                  {relativeTime(a.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No activity recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
