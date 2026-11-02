"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  Coins,
  Download,
  EyeOff,
  Network,
  RefreshCw,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Vote,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@juryza/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
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

import { PageHeader, Section, StatCard } from "@/components/page";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/format";
import { hasVoting, votingIsOpen } from "@/lib/phase";
import { useEvent } from "@/lib/queries";

/**
 * Voting & integrity: the community vote's configuration, live status, the
 * organizer-only tally (never public while voting runs) and the abuse signals
 * the API collects — voters sharing a network, burst minutes, and the latest
 * individual votes. Refreshes every 15 seconds.
 */

interface VotesData {
  open: boolean;
  budget: number;
  voters: number;
  byKind: { user: number; email: number; anon: number };
  tally: { projectId: string; title: string; votes: number; voters: number }[];
  signals: {
    sharedNetworks: { ip: string; voters: number }[];
    busiestMinutes: { at: string; votes: number }[];
  };
  recent: {
    projectId: string;
    title: string;
    voterKey: string;
    votes: number;
    ip: string | null;
    updatedAt: string;
  }[];
}

/** More distinct voters than this from one network is worth a look. */
const SHARED_IP_ALERT = 3;
/** Vote changes per minute that look like a burst rather than organic traffic. */
const BURST_ALERT = 20;

const ACCESS: Record<string, { label: string; body: string }> = {
  open: {
    label: "Open to anyone",
    body: "No sign-in needed. A device cookie identifies each voter, capped at 3 anonymous voters per network.",
  },
  email: {
    label: "Verified email",
    body: "Voters confirm an email address with a one-time code before their votes count.",
  },
  authenticated: {
    label: "Signed-in accounts",
    body: "Only people with a Juryza account can vote — one ballot each.",
  },
};

const voterKind = (key: string) => key.split(":")[0] ?? "anon";
const shortKey = (key: string) => {
  const [kind, rest = ""] = key.split(":");
  return `${kind}:${rest.length > 10 ? `${rest.slice(0, 6)}…${rest.slice(-3)}` : rest}`;
};

export default function VotingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: detail } = useEvent(slug);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["votes", slug],
    queryFn: () => api.get<VotesData>(`/api/events/${slug}/votes`),
    enabled: Boolean(detail && detail.event.workflow !== "innolab"),
    refetchInterval: 15_000,
  });

  const e = detail?.event;
  if (e?.workflow === "innolab") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Jury evaluation"
          description="Innolab final projects are evaluated only by judges appointed by platform admins."
        />
        <Alert>
          <AlertTitle>Community project voting is disabled</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            Participants cannot vote on final projects. Appoint the jury, assign submitted projects,
            and collect rubric scores through the judge workspace.
            <span className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/manage/${slug}/judges`} />}
              >
                Manage judges
              </Button>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/manage/${slug}/assignments`} />}
              >
                Manage assignments
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const configured = e ? hasVoting(e) : true;
  const open = data?.open ?? (e ? votingIsOpen(e) : false);
  const access = ACCESS[e?.votingAccess ?? "authenticated"] ?? ACCESS.authenticated;
  const totalVotes = data?.tally.reduce((n, t) => n + t.votes, 0) ?? 0;
  const maxVotes = Math.max(1, ...(data?.tally.map((t) => t.votes) ?? [1]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Voting & integrity"
        description="Quadratic community voting: casting n votes on a project costs n² credits from each voter's budget."
        actions={
          <>
            <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
              <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={`/api/events/${slug}/export?dataset=votes&format=csv`} download />}
            >
              <Download /> Votes CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Configuration
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/manage/${slug}/settings`} />}
              >
                <Settings /> Edit in settings
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!e ? (
              <Skeleton className="h-24" />
            ) : (
              <dl className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                    <ShieldCheck className="size-3.5" /> Who can vote
                  </dt>
                  <dd className="font-medium">{access?.label}</dd>
                  <dd className="text-muted-foreground text-xs">{access?.body}</dd>
                  {e.votingAccess === "email" && e.votingEmailDomains.length > 0 && (
                    <dd className="flex flex-wrap gap-1">
                      {e.votingEmailDomains.map((d) => (
                        <Badge key={d} variant="secondary">
                          @{d}
                        </Badge>
                      ))}
                    </dd>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                    <Coins className="size-3.5" /> Credit budget
                  </dt>
                  <dd className="font-medium tabular-nums">{e.voteBudget} credits per voter</dd>
                  <dd className="text-muted-foreground text-xs">
                    Up to {Math.floor(Math.sqrt(e.voteBudget))} votes on one project, or 1 vote on
                    each of {e.voteBudget}. Spreading support is cheap; piling on is expensive.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                    <CalendarClock className="size-3.5" /> Window
                  </dt>
                  {configured ? (
                    <>
                      <dd className="font-medium">
                        {e.votingOpen ? formatDateTime(e.votingOpen) : "Now"}
                      </dd>
                      <dd className="text-muted-foreground text-xs">
                        until{" "}
                        {e.votingClose ? formatDateTime(e.votingClose) : "results are published"}
                      </dd>
                    </>
                  ) : (
                    <dd className="text-muted-foreground text-sm">
                      No voting window — this event has no community vote.
                    </dd>
                  )}
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  open ? "bg-success animate-pulse" : "bg-muted-foreground"
                )}
              />
              <span className="font-semibold">
                {open ? "Voting is open" : configured ? "Voting is closed" : "Not configured"}
              </span>
            </div>
            {e && configured && (
              <p className="text-muted-foreground text-sm">
                {open
                  ? e.votingClose
                    ? `Closes ${relativeTime(e.votingClose)}.`
                    : "No closing time set."
                  : e.votingOpen && new Date(e.votingOpen).getTime() > Date.now()
                    ? `Opens ${relativeTime(e.votingOpen)}.`
                    : e.votingClose
                      ? `Closed ${relativeTime(e.votingClose)}.`
                      : null}
              </p>
            )}
            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <EyeOff className="mt-px size-3.5 shrink-0" />
              The tally below is visible to organizers only. The public sees no counts while voting
              runs, and results can't be published until it closes.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Voters" value={isLoading ? "…" : formatNumber(data?.voters)} icon={Vote} />
        <StatCard
          label="Signed-in"
          value={isLoading ? "…" : formatNumber(data?.byKind.user)}
          icon={UserRound}
          hint="user accounts"
        />
        <StatCard
          label="Email-verified"
          value={isLoading ? "…" : formatNumber(data?.byKind.email)}
          hint="one-time code"
        />
        <StatCard
          label="Anonymous"
          value={isLoading ? "…" : formatNumber(data?.byKind.anon)}
          hint="device cookie, IP-capped"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load votes</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <Section
              title="Live tally"
              description={`${formatNumber(totalVotes)} votes across ${data.tally.length} projects.`}
            >
              {data.tally.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Vote />
                    </EmptyMedia>
                    <EmptyTitle>No votes yet</EmptyTitle>
                    <EmptyDescription>
                      {open
                        ? "Share the event's Vote tab — tallies appear here as votes arrive."
                        : "Nobody has voted in this event."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Card className="py-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10 pl-4 text-right">#</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead className="w-48">Votes</TableHead>
                          <TableHead className="pr-4 text-right">Voters</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.tally.map((t, i) => (
                          <TableRow key={t.projectId}>
                            <TableCell className="text-muted-foreground pl-4 text-right tabular-nums">
                              {i + 1}
                            </TableCell>
                            <TableCell className="max-w-64 truncate font-medium">
                              {t.title}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="bg-muted h-2 flex-1 rounded-full">
                                  <div
                                    className="bg-chart-1 h-2 rounded-full"
                                    style={{ width: `${(t.votes / maxVotes) * 100}%` }}
                                  />
                                </div>
                                <span className="w-8 text-right text-sm tabular-nums">
                                  {t.votes}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="pr-4 text-right tabular-nums">
                              {t.voters}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </Section>

            <div className="flex flex-col gap-6">
              <Section
                title="Shared networks"
                description="Distinct voters seen from the same IP address."
              >
                <Card className="gap-0 py-2">
                  <CardContent className="px-4">
                    {data.signals.sharedNetworks.length === 0 ? (
                      <p className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
                        <Network className="size-4" /> No network has more than one voter.
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {data.signals.sharedNetworks.map((n) => {
                          const hot = n.voters > SHARED_IP_ALERT;
                          return (
                            <li key={n.ip} className="flex items-center gap-3 py-2 text-sm">
                              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                                {n.ip}
                              </code>
                              {hot && (
                                <Badge className="bg-warning text-warning-foreground">
                                  <TriangleAlert /> Review
                                </Badge>
                              )}
                              <span className={cn("tabular-nums", hot && "font-semibold")}>
                                {n.voters} voters
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <p className="text-muted-foreground text-xs">
                  Offices and campus Wi-Fi share IPs legitimately. More than {SHARED_IP_ALERT} is
                  flagged; anonymous voters are hard-capped at 3 per network by the API (blocked
                  attempts appear in the audit log as{" "}
                  <code className="font-mono">vote.blocked.ip_cap</code>).
                </p>
              </Section>

              <Section
                title="Busiest minutes"
                description="Vote changes per minute — bursts suggest scripted voting."
              >
                <Card className="gap-0 py-3">
                  <CardContent className="px-4">
                    {data.signals.busiestMinutes.length === 0 ? (
                      <p className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                        <Activity className="size-4" /> No activity yet.
                      </p>
                    ) : (
                      <BurstBars minutes={data.signals.busiestMinutes} />
                    )}
                  </CardContent>
                </Card>
              </Section>
            </div>
          </div>

          <Section
            title="Recent votes"
            description="The latest 50 changes. Voter keys are pseudonymous and truncated."
          >
            {data.recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing yet.</p>
            ) : (
              <Card className="py-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Voter</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Votes</TableHead>
                        <TableHead className="text-right">Credits</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead className="pr-4">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recent.map((r) => (
                        <TableRow key={`${r.voterKey}:${r.projectId}`}>
                          <TableCell className="pl-4">
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {voterKind(r.voterKey)}
                              </Badge>
                              <code
                                className="text-muted-foreground font-mono text-xs"
                                title={r.voterKey}
                              >
                                {shortKey(r.voterKey)}
                              </code>
                            </span>
                          </TableCell>
                          <TableCell className="max-w-56 truncate">{r.title}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.votes}</TableCell>
                          <TableCell className="text-muted-foreground text-right tabular-nums">
                            {r.votes ** 2}
                          </TableCell>
                          <TableCell>
                            <code className="font-mono text-xs">{r.ip ?? "—"}</code>
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground pr-4 text-sm"
                            title={formatDateTime(r.updatedAt)}
                          >
                            {relativeTime(r.updatedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function BurstBars({ minutes }: { minutes: { at: string; votes: number }[] }) {
  const max = Math.max(BURST_ALERT, ...minutes.map((m) => m.votes));
  return (
    <ul className="flex flex-col gap-2">
      {minutes.map((m) => {
        const hot = m.votes >= BURST_ALERT;
        return (
          <li key={m.at} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
            <span
              className="text-muted-foreground text-xs tabular-nums"
              title={formatDateTime(m.at)}
            >
              {new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(m.at))}
            </span>
            <div className="bg-muted h-2 rounded-full">
              <div
                className={cn("h-2 rounded-full", hot ? "bg-warning" : "bg-chart-1")}
                style={{ width: `${(m.votes / max) * 100}%` }}
              />
            </div>
            <span className={cn("flex items-center gap-1 tabular-nums", hot && "font-semibold")}>
              {hot && <TriangleAlert className="text-warning size-3.5" aria-label="Burst" />}
              {m.votes}
            </span>
          </li>
        );
      })}
      <li className="text-muted-foreground text-xs">
        Flagged at {BURST_ALERT}+ per minute. Each voter is also rate-limited to 30 changes a minute
        by the API.
      </li>
    </ul>
  );
}
