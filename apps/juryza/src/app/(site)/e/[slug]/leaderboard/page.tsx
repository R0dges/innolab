"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  ChevronDown,
  Eye,
  GitCompareArrows,
  Heart,
  Lock,
  Medal,
  Minus,
  Scale,
  Trophy,
  Users,
  Vote,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@juryza/ui/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@juryza/ui/components/ui/tabs";
import { cn } from "@juryza/ui/lib/utils";

import { StatCard } from "@/components/page";
import { ProjectCover } from "@/components/project-card";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { votingIsOpen } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { useEvent } from "@/lib/queries";
import type { EventResults } from "@/lib/server/results";
import type { Json } from "@/lib/types";

/**
 * The event leaderboard. Sealed until organizers publish (organizers see a
 * preview). Then: podium, prize winners, and tabs for the overall normalized
 * ranking, per-track tops, community choice and pairwise strength — with a
 * plain-language note on how the numbers are computed.
 */

type Published = { published: boolean; preview: boolean } & Json<EventResults>;
type ResultsResponse = { published: false; event: { slug: string; name: string } } | Published;
type Row = Published["projects"][number];

export default function LeaderboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: ev } = useEvent(slug);
  const { data, isLoading, error } = useQuery({
    queryKey: ["results", slug],
    queryFn: () => api.get<ResultsResponse>(`/api/events/${slug}/results`),
  });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn't load the leaderboard</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading || !data) return <LeaderboardSkeleton />;

  if (!("projects" in data)) {
    const voting = ev ? votingIsOpen(ev.event) : false;
    return (
      <Empty className="border py-20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Lock />
          </EmptyMedia>
          <EmptyTitle className="text-base">
            Results are sealed until the organizers publish them
          </EmptyTitle>
          <EmptyDescription>
            Judges' scores are normalized per judge — so a tough marker and a generous one count the
            same — and nothing is shown until the final ranking is locked in.
            {voting
              ? " Community voting is still in progress, and no tallies are visible while it runs."
              : ""}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          {voting && (
            <Button nativeButton={false} render={<Link href={`/e/${slug}/vote`} />}>
              <Vote /> Cast your votes
            </Button>
          )}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/e/${slug}/projects`} />}
          >
            Browse projects
          </Button>
        </EmptyContent>
        {ev?.event.votingClose && voting && (
          <p className="text-muted-foreground text-xs">
            Voting closes {formatDateTime(ev.event.votingClose)}
          </p>
        )}
      </Empty>
    );
  }

  const ranked = data.projects.filter((p) => p.rank !== null);
  const top = ranked.slice(0, 3);
  const winners = data.prizes
    .map((pz) => ({
      prize: pz,
      project: data.projects.find((p) => p.awards.some((a) => a.prizeId === pz.id)),
    }))
    .filter((w) => w.project);
  const href = (id: string) => `/e/${slug}/projects/${id}`;

  return (
    <div className="flex flex-col gap-8">
      {data.preview && (
        <Alert>
          <Eye />
          <AlertTitle>Preview — not public yet</AlertTitle>
          <AlertDescription>
            You're seeing this because you organize the event. Everyone else sees a sealed
            leaderboard until you publish results.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Projects ranked"
          value={ranked.length}
          hint={`of ${data.totals.submitted} submitted`}
          icon={Trophy}
        />
        <StatCard label="Judge scores" value={formatNumber(data.totals.scores)} icon={Scale} />
        <StatCard label="Community voters" value={formatNumber(data.totals.voters)} icon={Users} />
        <StatCard
          label="Pairwise calls"
          value={formatNumber(data.totals.comparisons)}
          icon={GitCompareArrows}
        />
      </div>

      {top.length > 0 && (
        <section className="flex flex-col gap-4" aria-label="Podium">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Top of the table</h2>
            {top.length >= 2 && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/e/${slug}/compare?ids=${top.map((p) => p.id).join(",")}`} />}
              >
                <GitCompareArrows /> Compare top {top.length}
              </Button>
            )}
          </div>
          <Podium top={top} href={href} />
        </section>
      )}

      {winners.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Prize winners</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {winners.map(({ prize, project }) =>
              project ? (
                <Link key={prize.id} href={href(project.id)} className="group">
                  <Card className="h-full flex-row items-center gap-3 px-4 transition-shadow group-hover:shadow-md">
                    <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                      <Award className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-muted-foreground text-xs">
                        {prize.name}
                        {prize.amount ? ` · ${prize.amount}` : ""}
                      </span>
                      <span className="truncate font-semibold">{project.title}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {project.teamName ?? "Solo"}
                      </span>
                    </div>
                  </Card>
                </Link>
              ) : null
            )}
          </div>
        </section>
      )}

      <Tabs defaultValue="overall" className="gap-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overall">
              <Trophy /> Overall
            </TabsTrigger>
            {EVENT_TRACKS_ENABLED && (
              <TabsTrigger value="tracks">
                <Medal /> By track
              </TabsTrigger>
            )}
            <TabsTrigger value="community">
              <Vote /> Community choice
            </TabsTrigger>
            <TabsTrigger value="pairwise">
              <Scale /> Pairwise
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overall">
          <OverallTable rows={data.projects} href={href} />
        </TabsContent>
        {EVENT_TRACKS_ENABLED && (
          <TabsContent value="tracks">
            <ByTrack rows={ranked} href={href} />
          </TabsContent>
        )}
        <TabsContent value="community">
          <CommunityTable rows={data.projects} href={href} />
        </TabsContent>
        <TabsContent value="pairwise">
          <PairwiseTable rows={data.projects} href={href} />
        </TabsContent>
      </Tabs>

      <Methodology criteria={data.criteria} />
    </div>
  );
}

function Podium({ top, href }: { top: Row[]; href: (id: string) => string }) {
  // Visual order 2 · 1 · 3 on wide screens; natural order on mobile.
  const order = ["sm:order-2", "sm:order-1", "sm:order-3"];
  const lift = ["sm:pt-0", "sm:pt-8", "sm:pt-12"];
  return (
    <ol className="grid gap-4 sm:grid-cols-3 sm:items-end">
      {top.map((p, i) => (
        <li key={p.id} className={cn(order[i], lift[i])}>
          <Link href={href(p.id)} className="group block">
            <Card
              className={cn(
                "gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md",
                i === 0 && "ring-primary/40 ring-2"
              )}
            >
              <div className="relative">
                <ProjectCover
                  project={p}
                  className={cn("w-full", i === 0 ? "aspect-[16/9]" : "aspect-[2/1]")}
                />
                <span
                  className={cn(
                    "bg-background absolute bottom-0 left-4 grid size-10 translate-y-1/2 place-items-center rounded-full border-2 text-sm font-bold shadow-sm tabular-nums",
                    i === 0 && "border-primary text-primary"
                  )}
                >
                  {i === 0 ? <Trophy className="size-4" /> : p.rank}
                </span>
              </div>
              <div className="flex flex-col gap-1 p-4 pt-7">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-semibold">{p.title}</span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {formatNumber(p.normalized, 2)}
                  </span>
                </div>
                <span className="text-muted-foreground truncate text-xs">
                  {p.teamName ?? "Solo"}
                  {p.trackName ? ` · ${p.trackName}` : ""}
                </span>
                {p.awards.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.awards.map((a) => (
                      <Badge key={a.prizeId} variant="secondary" className="gap-1">
                        <Award /> {a.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function ProjectCell({ p, href }: { p: Row; href: (id: string) => string }) {
  return (
    <Link href={href(p.id)} className="flex min-w-0 items-center gap-3 hover:underline">
      <ProjectCover project={p} size="sm" className="size-8 shrink-0 rounded-md" />
      <span className="flex min-w-0 flex-col">
        <span className="max-w-64 truncate font-medium">{p.title}</span>
        <span className="text-muted-foreground max-w-64 truncate text-xs">
          {p.teamName ?? "Solo"}
        </span>
      </span>
    </Link>
  );
}

function RankChange({ rank, rawRank }: { rank: number | null; rawRank: number | null }) {
  if (rank === null || rawRank === null) return <span className="text-muted-foreground">—</span>;
  const d = rawRank - rank;
  if (d === 0)
    return (
      <span
        className="text-muted-foreground inline-flex items-center gap-1"
        title="Same rank before and after normalization"
      >
        <Minus className="size-3.5" />
        <span className="sr-only">No change</span>
      </span>
    );
  const up = d > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums",
        up ? "text-success" : "text-destructive"
      )}
      title={`Raw rank #${rawRank} → normalized rank #${rank}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(d)}
      <span className="sr-only">{up ? "places up" : "places down"} after normalization</span>
    </span>
  );
}

function ScoreBar({ value, max = 5 }: { value: number | null; max?: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className="bg-muted hidden h-1.5 w-20 overflow-hidden rounded-full md:block"
        aria-hidden
      >
        {value !== null && (
          <span
            className="bg-chart-1 block h-full rounded-full"
            style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
          />
        )}
      </span>
      <span className="w-10 text-right font-semibold tabular-nums">{formatNumber(value, 2)}</span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  return (
    <span
      className={cn(
        "grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums",
        rank !== null && rank <= 3
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      {rank ?? "—"}
    </span>
  );
}

function OverallTable({ rows, href }: { rows: Row[]; href: (id: string) => string }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 pl-4">Rank</TableHead>
            <TableHead>Project</TableHead>
            {EVENT_TRACKS_ENABLED && <TableHead className="hidden lg:table-cell">Track</TableHead>}
            <TableHead className="text-right">Reviews</TableHead>
            <TableHead className="text-right">Coup de cœur</TableHead>
            <TableHead className="text-right">Normalized</TableHead>
            <TableHead className="text-right">Raw + bonus</TableHead>
            <TableHead
              className="pr-4 text-right"
              title="Rank change from raw average to normalized score"
            >
              Δ norm.
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="pl-4">
                <RankBadge rank={p.rank} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <ProjectCell p={p} href={href} />
                  {p.awards.length > 0 && (
                    <Award
                      className="text-primary size-4 shrink-0"
                      aria-label={p.awards.map((a) => a.name).join(", ")}
                    />
                  )}
                </div>
              </TableCell>
              {EVENT_TRACKS_ENABLED && (
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {p.trackName ?? "—"}
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums">{p.reviews}</TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Heart className="text-primary size-3.5" /> {p.favorites}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <ScoreBar value={p.normalized} />
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatNumber(p.raw, 2)}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <RankChange rank={p.rank} rawRank={p.rawRank} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ByTrack({ rows, href }: { rows: Row[]; href: (id: string) => string }) {
  const tracks = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.trackName ?? "No track";
    tracks.set(k, [...(tracks.get(k) ?? []), r]);
  }
  if (tracks.size === 0)
    return <p className="text-muted-foreground text-sm">No ranked projects yet.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[...tracks.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, list]) => (
          <Card key={name} className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{name}</CardTitle>
              <CardDescription>{list.length} ranked</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-1">
                {[...list]
                  .sort((a, b) => (a.trackRank ?? 1e9) - (b.trackRank ?? 1e9))
                  .slice(0, 5)
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-1">
                      <RankBadge rank={p.trackRank} />
                      <ProjectCell p={p} href={href} />
                      <span className="ml-auto text-sm font-semibold tabular-nums">
                        {formatNumber(p.normalized, 2)}
                      </span>
                    </li>
                  ))}
              </ol>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function CommunityTable({ rows, href }: { rows: Row[]; href: (id: string) => string }) {
  const list = rows
    .filter((r) => r.votes > 0)
    .sort((a, b) => b.votes - a.votes || b.voters - a.voters);
  if (list.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No community votes</EmptyTitle>
          <EmptyDescription>Nobody voted in this event, or it had no public vote.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const max = Math.max(...list.map((r) => r.votes));
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 pl-4">Rank</TableHead>
            <TableHead>Project</TableHead>
            <TableHead className="text-right">Voters</TableHead>
            <TableHead className="pr-4 text-right">Votes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="pl-4">
                <RankBadge rank={p.communityRank} />
              </TableCell>
              <TableCell>
                <ProjectCell p={p} href={href} />
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {p.voters}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <ScoreBar value={p.votes} max={max} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PairwiseTable({ rows, href }: { rows: Row[]; href: (id: string) => string }) {
  const list = rows
    .filter((r) => r.pairwise)
    .sort((a, b) => (b.pairwise?.strength ?? 0) - (a.pairwise?.strength ?? 0));
  if (list.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No pairwise judging</EmptyTitle>
          <EmptyDescription>This event didn't use head-to-head comparisons.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 pl-4">#</TableHead>
            <TableHead>Project</TableHead>
            <TableHead className="text-right">Won</TableHead>
            <TableHead className="text-right">Lost</TableHead>
            <TableHead className="text-right">Strength</TableHead>
            <TableHead className="pr-4 text-right">Scaled (1–5)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((p, i) => (
            <TableRow key={p.id}>
              <TableCell className="pl-4">
                <RankBadge rank={i + 1} />
              </TableCell>
              <TableCell>
                <ProjectCell p={p} href={href} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.pairwise?.wins}</TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {p.pairwise?.losses}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatNumber(p.pairwise?.strength, 2)}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <ScoreBar value={p.pairwise?.scaled ?? null} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Methodology({ criteria }: { criteria: Published["criteria"] }) {
  return (
    <Collapsible className="rounded-xl border">
      <CollapsibleTrigger className="group/trigger hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-3">
        How scores are computed
        <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[panel-open]/trigger:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="text-muted-foreground flex flex-col gap-3 px-4 pb-4 text-sm">
        <p>
          Each judge marks projects on the rubric below (1–5 per criterion). A project's{" "}
          <strong className="text-foreground">raw score</strong> is the weighted mean of those
          marks, averaged over its judges. Each judge may also give one project their coup de cœur;
          it adds one point to that judge's rubric total before normalization.
        </p>
        <p>
          Judges differ: some mark hot, some cold. So every judge's scores are turned into{" "}
          <strong className="text-foreground">z-scores</strong> against their own mean and spread,
          then mapped back onto the 1–5 scale. The{" "}
          <strong className="text-foreground">normalized score</strong> — the one we rank by — is
          the mean of those. Δ norm. shows how many places normalization moved a project versus the
          raw average.
        </p>
        {criteria.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {criteria.map((c) => (
              <li key={c.key}>
                <Badge variant="outline" className="text-foreground">
                  {c.label} · {Math.round(c.weight * 100)}%
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p>
          Community votes are quadratic (n votes cost n² credits), and pairwise strength comes from
          a Bradley–Terry model over judges' head-to-head picks. Both are shown alongside, not mixed
          into, the judged ranking.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
