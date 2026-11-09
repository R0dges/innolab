"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Download,
  EqualApproximately,
  EyeOff,
  FlameKindling,
  Globe,
  Heart,
  Lock,
  Minus,
  Scale,
  Snowflake,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@juryza/ui/components/ui/alert-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@juryza/ui/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
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

import { PageHeader, StatCard } from "@/components/page";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { votingIsOpen } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { eventKey, useEvent } from "@/lib/queries";
import type { EventResults } from "@/lib/server/results";
import type { Json } from "@/lib/types";

/**
 * Results & publishing — the judging-integrity view. Organizers always see the
 * numbers (as a preview until published): the normalized ranking and how it
 * differs from raw averages, per-judge calibration with the z-score maths
 * spelled out, per-criterion means, and pairwise Bradley–Terry strengths.
 * Publishing is refused server-side while community voting is open.
 */

type Results = Json<Omit<EventResults, "judges">> & {
  published: boolean;
  preview?: boolean;
  judges?: Json<EventResults["judges"]>;
};
type ProjectRow = Results["projects"][number];
type JudgeRow = NonNullable<Results["judges"]>[number];

const fmt = (n: number | null | undefined, d = 2) => formatNumber(n, d);
const signed = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(d)}`;

export default function ResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: detail } = useEvent(slug);
  const { data, isLoading, error } = useQuery({
    queryKey: ["results", slug],
    queryFn: () => api.get<Results>(`/api/events/${slug}/results`),
  });
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const publish = useMutation({
    mutationFn: (body: { published: boolean; closeVoting?: boolean }) =>
      api.post<{ published: boolean }>(`/api/events/${slug}/results`, body),
    onSuccess: (res, body) => {
      setConfirmClose(false);
      setConfirmUnpublish(false);
      toast.success(
        res.published
          ? body.closeVoting
            ? "Voting closed and results published"
            : "Results published"
          : "Results hidden again"
      );
      qc.invalidateQueries({ queryKey: ["results", slug] });
      qc.invalidateQueries({ queryKey: eventKey(slug) });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403 && voteOpen) setConfirmClose(true);
      else toast.error(e.message);
    },
  });

  const voteOpen = detail ? votingIsOpen(detail.event) : false;
  const judgingClose = detail?.event.judgingClose
    ? new Date(detail.event.judgingClose).getTime()
    : null;
  const deliberationsClosed = judgingClose !== null && Date.now() >= judgingClose;
  const onPublish = () => (voteOpen ? setConfirmClose(true) : publish.mutate({ published: true }));
  const exportUrl = (dataset: string, format: "csv" | "json") =>
    `/api/events/${slug}/export?dataset=${dataset}&format=${format}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Results"
        description="Every number here is computed on read from the stored marks — the leaderboard, exports and certificates cannot disagree."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <Download /> Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Results</DropdownMenuLabel>
                <DropdownMenuItem render={<a href={exportUrl("results", "csv")} download />}>
                  Results · CSV
                </DropdownMenuItem>
                <DropdownMenuItem render={<a href={exportUrl("results", "json")} download />}>
                  Results · JSON
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Raw marks</DropdownMenuLabel>
                <DropdownMenuItem render={<a href={exportUrl("scores", "csv")} download />}>
                  Scores · CSV
                </DropdownMenuItem>
                <DropdownMenuItem render={<a href={exportUrl("scores", "json")} download />}>
                  Scores · JSON
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't compute results</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center">
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  data.published
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {data.published ? <Globe className="size-5" /> : <Lock className="size-5" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    {data.published ? "Results are public" : "Private preview"}
                  </h2>
                  <Badge variant={data.published ? "default" : "secondary"}>
                    {data.published ? "Published" : "Hidden"}
                  </Badge>
                  {voteOpen && <Badge variant="outline">Community voting open</Badge>}
                  {!data.published && !deliberationsClosed && (
                    <Badge variant="outline">Délibérations en cours</Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {data.published
                    ? "Everyone can see the leaderboard and the first-place team appears in the Wall of Fame. Unpublishing hides the numbers again."
                    : "Only organizers can see these numbers. The public leaderboard returns no scores until you publish."}
                  {!data.published &&
                    voteOpen &&
                    " Results can't go public while voting runs — they would sway the vote."}
                  {!data.published &&
                    !deliberationsClosed &&
                    (judgingClose === null
                      ? " Configurez la clôture des délibérations avant de publier."
                      : ` Publication disponible après le ${formatDateTime(judgingClose)}.`)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {data.published ? (
                  <Button
                    variant="outline"
                    disabled={publish.isPending}
                    onClick={() => setConfirmUnpublish(true)}
                  >
                    <EyeOff /> Unpublish
                  </Button>
                ) : (
                  <Button
                    disabled={
                      publish.isPending || data.projects.length === 0 || !deliberationsClosed
                    }
                    onClick={onPublish}
                  >
                    {publish.isPending ? <Spinner /> : <Trophy />} Publish results
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Submitted projects" value={data.totals.submitted} />
            <StatCard
              label="Scores"
              value={formatNumber(data.totals.scores)}
              hint={
                data.totals.submitted
                  ? `${(data.totals.scores / data.totals.submitted).toFixed(1)} per project on average`
                  : undefined
              }
            />
            <StatCard label="Judges who scored" value={data.judges?.length ?? 0} />
            <StatCard label="Pairwise comparisons" value={formatNumber(data.totals.comparisons)} />
          </div>

          {data.projects.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Trophy />
                </EmptyMedia>
                <EmptyTitle>No submitted projects yet</EmptyTitle>
                <EmptyDescription>
                  Results appear once projects are submitted and judges start scoring.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Tabs defaultValue="ranking">
              <div className="overflow-x-auto">
                <TabsList>
                  <TabsTrigger value="ranking">Ranking</TabsTrigger>
                  <TabsTrigger value="calibration">Judge calibration</TabsTrigger>
                  <TabsTrigger value="criteria">By criterion</TabsTrigger>
                  <TabsTrigger value="pairwise">Pairwise</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="ranking" className="pt-2">
                <Ranking data={data} />
              </TabsContent>
              <TabsContent value="calibration" className="pt-2">
                <Calibration judges={data.judges ?? []} />
              </TabsContent>
              <TabsContent value="criteria" className="pt-2">
                <ByCriterion data={data} />
              </TabsContent>
              <TabsContent value="pairwise" className="pt-2">
                <Pairwise data={data} />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close voting and publish?</AlertDialogTitle>
            <AlertDialogDescription>
              Community voting is still open. Publishing now would let the leaderboard sway votes
              still being cast, so Juryza ends the voting window at this moment first. Votes already
              cast are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep voting open</AlertDialogCancel>
            <AlertDialogAction
              disabled={publish.isPending}
              onClick={() => publish.mutate({ published: true, closeVoting: true })}
            >
              {publish.isPending && <Spinner />} Close voting &amp; publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide the results?</AlertDialogTitle>
            <AlertDialogDescription>
              The public leaderboard goes back to showing no numbers. Certificates already issued
              stay valid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={publish.isPending}
              onClick={() => publish.mutate({ published: false })}
            >
              {publish.isPending && <Spinner />} Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RankShift({ p }: { p: ProjectRow }) {
  if (p.rank === null || p.rawRank === null)
    return <span className="text-muted-foreground">—</span>;
  const d = p.rawRank - p.rank;
  if (d === 0)
    return (
      <span
        className="text-muted-foreground inline-flex items-center gap-0.5 tabular-nums"
        title="Same as raw rank"
      >
        <Minus className="size-3" /> 0
      </span>
    );
  const up = d > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        up ? "text-success" : "text-destructive"
      )}
      title={`Raw rank ${p.rawRank} → normalized rank ${p.rank}`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(d)}
      <span className="sr-only">{up ? "places up" : "places down"} after normalization</span>
    </span>
  );
}

function Ranking({ data }: { data: Results }) {
  const [track, setTrack] = useState<string>("all");
  const tracks = EVENT_TRACKS_ENABLED
    ? [
        ...new Map(
          data.projects
            .filter((p) => p.trackId)
            .map((p) => [p.trackId as string, p.trackName ?? ""])
        ).entries(),
      ]
    : [];
  const rows = data.projects.filter((p) => track === "all" || p.trackId === track);
  const moved = data.projects.filter(
    (p) => p.rank !== null && p.rawRank !== null && p.rank !== p.rawRank
  ).length;
  const unscored = data.projects.filter((p) => p.reviews === 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <p className="text-muted-foreground max-w-3xl text-sm">
          Ranked by <span className="text-foreground font-medium">normalized mean</span> — each
          judge's scores are re-centred so a harsh or generous judge can't decide the outcome. The{" "}
          <span className="text-foreground font-medium">Δ</span> column shows how far each project
          moved versus ranking by raw averages: {countProjects(moved)} changed place. Each coach's
          coup de cœur adds one point to the rubric total before normalization.
          {unscored > 0 && ` ${unscored} project(s) have no scores yet and are unranked.`}
        </p>
        {tracks.length > 1 && (
          <Select value={track} onValueChange={(v) => setTrack(v ?? "all")}>
            <SelectTrigger className="w-48" aria-label="Filter by track">
              <SelectValue>
                {(v: string) =>
                  v === "all" ? "All tracks" : (tracks.find(([id]) => id === v)?.[1] ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tracks</SelectItem>
              {tracks.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <Card className="py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 pl-4 text-right">Rank</TableHead>
                <TableHead>Project</TableHead>
                {EVENT_TRACKS_ENABLED && <TableHead>Track</TableHead>}
                <TableHead className="text-right">Reviews</TableHead>
                <TableHead className="text-right">Coup de cœur</TableHead>
                <TableHead className="text-right">Raw + bonus</TableHead>
                <TableHead className="text-right">Normalized</TableHead>
                <TableHead className="text-right">Raw rank</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="pr-4">Awards</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4 text-right font-semibold tabular-nums">
                    {p.rank ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium">{p.title}</p>
                    {p.teamName && (
                      <p className="text-muted-foreground truncate text-xs">{p.teamName}</p>
                    )}
                  </TableCell>
                  {EVENT_TRACKS_ENABLED && (
                    <TableCell className="text-muted-foreground">
                      {p.trackName ?? "—"}
                      {track !== "all" && p.trackRank !== null && (
                        <span className="text-xs tabular-nums"> · #{p.trackRank} in track</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      p.reviews === 0 && "text-muted-foreground"
                    )}
                  >
                    {p.reviews}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="text-primary size-3.5" /> {p.favorites}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {fmt(p.raw)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {fmt(p.normalized)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {p.rawRank ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <RankShift p={p} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex flex-wrap gap-1">
                      {p.awards.map((a) => (
                        <Badge key={a.prizeId}>
                          <Trophy /> {a.name}
                          {a.amount && <span className="opacity-80">· {a.amount}</span>}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

const countProjects = (n: number) => `${n} project${n === 1 ? "" : "s"}`;

const FLAG: Record<
  NonNullable<JudgeRow["flag"]>,
  { label: string; icon: React.ComponentType<{ className?: string }>; body: string; effect: string }
> = {
  flat: {
    label: "Flat",
    icon: EqualApproximately,
    body: "Gave everything the same score",
    effect: "No ranking signal — every score maps to the global mean",
  },
  harsh: {
    label: "Harsh",
    icon: Snowflake,
    body: "Mean more than 0.5 below everyone",
    effect: "Scores lifted relative to their own average",
  },
  generous: {
    label: "Generous",
    icon: FlameKindling,
    body: "Mean more than 0.5 above everyone",
    effect: "Scores pulled down relative to their own average",
  },
};

function FlagBadge({ flag }: { flag: JudgeRow["flag"] }) {
  if (!flag) return null;
  const f = FLAG[flag];
  return (
    <Badge
      className={cn(
        flag === "flat"
          ? "bg-destructive/10 text-destructive"
          : "bg-warning text-warning-foreground"
      )}
      title={f.body}
    >
      <f.icon /> {f.label}
    </Badge>
  );
}

function Calibration({ judges }: { judges: JudgeRow[] }) {
  if (judges.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Scale />
          </EmptyMedia>
          <EmptyTitle>No scores yet</EmptyTitle>
          <EmptyDescription>Calibration appears once judges have scored projects.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const first = judges[0] as JudgeRow;
  const globalMean = first.mean - first.offset;
  const flagged = judges.filter((j) => j.flag);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Judge means around the global mean</CardTitle>
            <CardDescription>
              One dot per judge at their average raw score. The shaded band is ±0.5 of the global
              mean (<span className="tabular-nums">{globalMean.toFixed(2)}</span>); outside it a
              judge is flagged harsh or generous.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JudgeStrip judges={judges} globalMean={globalMean} />
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" /> How normalization works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p>
              Judges run hot or cold. A 3.5 from a tough judge can mean more than a 4.5 from a
              generous one. So each score is compared with{" "}
              <span className="text-foreground font-medium">that judge's own average</span>, not
              read at face value.
            </p>
            <ol className="flex list-decimal flex-col gap-2 pl-4">
              <li>
                Each coach may give one project their coup de cœur. It adds one point to that
                coach's rubric total before normalization.
              </li>
              <li>
                <span className="text-foreground">z-score</span> — how many of the judge's own
                standard deviations above or below their mean this score sits:
                <code className="bg-muted text-foreground mt-1 block rounded px-2 py-1 font-mono text-xs">
                  z = (score − judge mean) ÷ judge sd
                </code>
              </li>
              <li>
                <span className="text-foreground">Back onto 1–5</span> — centred on the global mean
                with a fixed spread:
                <code className="bg-muted text-foreground mt-1 block rounded px-2 py-1 font-mono text-xs">
                  normalized = {globalMean.toFixed(2)} + z × 0.9
                </code>
              </li>
              <li>
                A project's final score is the{" "}
                <span className="text-foreground">mean of its normalized scores</span>.
              </li>
            </ol>
            <p>
              A judge who gave everything the same mark has sd = 0: there's no ranking in their
              marks, so they add nothing either way (z = 0 → global mean) instead of dividing by
              zero.
            </p>
          </CardContent>
        </Card>
      </div>

      {flagged.length > 0 && (
        <Alert>
          <Sparkles />
          <AlertTitle>
            {flagged.length} judge{flagged.length === 1 ? "" : "s"} flagged — already corrected for
          </AlertTitle>
          <AlertDescription>
            Flags don't exclude anyone; normalization neutralizes the bias automatically. They tell
            you who to brief before the next round.
          </AlertDescription>
        </Alert>
      )}

      <Card className="py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Judge</TableHead>
                <TableHead className="text-right">Scores (n)</TableHead>
                <TableHead className="text-right">Mean</TableHead>
                <TableHead className="text-right">Std dev</TableHead>
                <TableHead className="text-right">Offset vs global</TableHead>
                <TableHead className="pr-4">Flag &amp; effect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {judges.map((j) => (
                <TableRow key={j.judgeId}>
                  <TableCell className="pl-4 font-medium">{j.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{j.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{j.mean.toFixed(2)}</TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", j.sd === 0 && "text-muted-foreground")}
                  >
                    {j.sd.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      Math.abs(j.offset) > 0.5 ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {signed(j.offset)}
                  </TableCell>
                  <TableCell className="pr-4">
                    {j.flag ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <FlagBadge flag={j.flag} />
                        <span className="text-muted-foreground text-xs">
                          {FLAG[j.flag].body}. {FLAG[j.flag].effect}.
                        </span>
                      </div>
                    ) : j.count < 2 ? (
                      <span className="text-muted-foreground text-xs">
                        One score — too few to measure spread; counts as the global mean
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Within range</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/**
 * Dot strip on the 1–5 scale. Dots that would overlap are stacked into lanes
 * (a simple beeswarm). Hover or focus a dot to read its judge.
 */
function JudgeStrip({ judges, globalMean }: { judges: JudgeRow[]; globalMean: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 640;
  const pad = 16;
  const lanePx = 14;
  const x = (v: number) => pad + ((Math.min(5, Math.max(1, v)) - 1) / 4) * (W - pad * 2);

  const lanes: number[][] = [];
  const placed = [...judges]
    .sort((a, b) => a.mean - b.mean)
    .map((j) => {
      const px = x(j.mean);
      let lane = lanes.findIndex((xs) => xs.every((o) => Math.abs(o - px) >= 12));
      if (lane === -1) lane = lanes.push([]) - 1;
      lanes[lane]?.push(px);
      return { j, px, lane };
    });
  const laneCount = Math.max(1, lanes.length);
  const plotH = laneCount * lanePx + 16;
  const H = plotH + 26;
  const cy = (lane: number) => plotH - 10 - lane * lanePx;
  const active = placed.find((p) => p.j.judgeId === hover)?.j;

  const fill = (flag: JudgeRow["flag"]) =>
    flag === "flat" ? "var(--destructive)" : flag ? "var(--warning)" : "var(--chart-1)";

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Distribution of judge mean scores"
      >
        <rect
          x={x(globalMean - 0.5)}
          y={4}
          width={x(globalMean + 0.5) - x(globalMean - 0.5)}
          height={plotH - 4}
          fill="var(--muted)"
          rx={4}
        />
        <line x1={pad} x2={W - pad} y1={plotH} y2={plotH} stroke="var(--border)" strokeWidth={1} />
        {[1, 2, 3, 4, 5].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={plotH} y2={plotH + 4} stroke="var(--border)" />
            <text
              x={x(t)}
              y={plotH + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}
        <line
          x1={x(globalMean)}
          x2={x(globalMean)}
          y1={0}
          y2={plotH}
          stroke="var(--foreground)"
          strokeWidth={1.5}
          strokeDasharray="0"
        />
        <text x={x(globalMean) + 4} y={10} className="fill-foreground text-[10px] font-medium">
          global {globalMean.toFixed(2)}
        </text>
        {placed.map(({ j, px, lane }) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: SVG hover target; the table below carries the same data.
          <g
            key={j.judgeId}
            onMouseEnter={() => setHover(j.judgeId)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default"
          >
            <circle cx={px} cy={cy(lane)} r={10} fill="transparent" />
            <circle
              cx={px}
              cy={cy(lane)}
              r={hover === j.judgeId ? 6 : 5}
              fill={fill(j.flag)}
              stroke="var(--card)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
        <div className="text-muted-foreground">
          {active ? (
            <span className="text-foreground">
              <span className="font-medium">{active.name}</span> · mean{" "}
              <span className="tabular-nums">{active.mean.toFixed(2)}</span> · sd{" "}
              <span className="tabular-nums">{active.sd.toFixed(2)}</span> · n = {active.count} ·{" "}
              <span className="tabular-nums">{signed(active.offset)}</span> vs global
            </span>
          ) : (
            "Hover a dot to see the judge."
          )}
        </div>
        <ul className="text-muted-foreground flex flex-wrap gap-4">
          <li className="flex items-center gap-1.5">
            <span className="bg-chart-1 size-2.5 rounded-full" /> Within range
          </li>
          <li className="flex items-center gap-1.5">
            <span className="bg-warning size-2.5 rounded-full" /> Harsh / generous
          </li>
          <li className="flex items-center gap-1.5">
            <span className="bg-destructive size-2.5 rounded-full" /> Flat
          </li>
        </ul>
      </div>
    </div>
  );
}

function ByCriterion({ data }: { data: Results }) {
  const [all, setAll] = useState(false);
  const ranked = data.projects.filter((p) => p.reviews > 0);
  const rows = all ? ranked : ranked.slice(0, 15);
  const totalWeight = data.criteria.reduce((n, c) => n + c.weight, 0) || 1;
  const avg = (key: string) => {
    const xs = ranked.map((p) => p.criteria[key]).filter((x): x is number => typeof x === "number");
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };

  if (data.criteria.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No rubric criteria</EmptyTitle>
          <EmptyDescription>
            Add criteria on the Rubric page to see per-criterion means.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground max-w-3xl text-sm">
        Mean raw mark (1–5) per criterion across a project's judges, before normalization. Cell
        shading deepens with the mark. Useful for feedback: a project can rank high overall and
        still trail on one axis.
      </p>
      <Card className="py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 pl-4 text-right">Rank</TableHead>
                <TableHead>Project</TableHead>
                {data.criteria.map((c) => (
                  <TableHead key={c.key} className="text-right">
                    <span className="flex flex-col items-end leading-tight">
                      {c.label}
                      <span className="text-muted-foreground text-[11px] font-normal tabular-nums">
                        {Math.round((c.weight / totalWeight) * 100)}% weight
                      </span>
                    </span>
                  </TableHead>
                ))}
                <TableHead className="pr-4 text-right">Normalized</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell className="pl-4" />
                <TableCell className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Event average
                </TableCell>
                {data.criteria.map((c) => (
                  <TableCell key={c.key} className="text-muted-foreground text-right tabular-nums">
                    {fmt(avg(c.key))}
                  </TableCell>
                ))}
                <TableCell className="pr-4" />
              </TableRow>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4 text-right font-semibold tabular-nums">
                    {p.rank ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-56 truncate font-medium">{p.title}</TableCell>
                  {data.criteria.map((c) => {
                    const v = p.criteria[c.key];
                    return (
                      <TableCell key={c.key} className="text-right tabular-nums">
                        <span
                          className="inline-block min-w-12 rounded px-1.5 py-0.5"
                          style={
                            typeof v === "number"
                              ? {
                                  background: `color-mix(in oklch, var(--chart-1) ${Math.round(((v - 1) / 4) * 45)}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {fmt(v)}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="pr-4 text-right font-medium tabular-nums">
                    {fmt(p.normalized)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      {ranked.length > 15 && (
        <Button variant="outline" className="self-start" onClick={() => setAll(!all)}>
          {all ? "Show top 15" : `Show all ${ranked.length} scored projects`}
        </Button>
      )}
    </div>
  );
}

function Pairwise({ data }: { data: Results }) {
  const rows = data.projects
    .filter(
      (p): p is ProjectRow & { pairwise: NonNullable<ProjectRow["pairwise"]> } =>
        p.pairwise !== null
    )
    .sort((a, b) => b.pairwise.strength - a.pairwise.strength);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Swords />
              </EmptyMedia>
              <EmptyTitle>No pairwise comparisons yet</EmptyTitle>
              <EmptyDescription>
                Judges can compare two projects head-to-head from their judging queue.
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
                    <TableHead className="text-right">Wins</TableHead>
                    <TableHead className="text-right">Losses</TableHead>
                    <TableHead className="w-48">Strength (1–5)</TableHead>
                    <TableHead className="pr-4 text-right">Judged rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground pl-4 text-right tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-medium">{p.title}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.pairwise.wins}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.pairwise.losses}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="bg-muted h-2 flex-1 rounded-full">
                            <div
                              className="bg-chart-1 h-2 rounded-full"
                              style={{ width: `${((p.pairwise.scaled - 1) / 4) * 100}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs tabular-nums">
                            {p.pairwise.scaled.toFixed(2)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground pr-4 text-right tabular-nums">
                        {p.rank ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
        <Card className="gap-3 self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Swords className="size-4" /> Bradley–Terry, in brief
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p>
              Pairwise mode asks judges “which of these two is better?” instead of for a 1–5 score.
              There are no harsh or generous judges when everyone only says “A beats B”.
            </p>
            <p>Each project gets a latent strength s, fitted so that</p>
            <code className="bg-muted text-foreground rounded px-2 py-1 font-mono text-xs">
              P(A beats B) = sA ÷ (sA + sB)
            </code>
            <p>
              Beating a strong project counts for more than beating a weak one. Strengths are
              rescaled to 1–5 to sit beside rubric scores; the judged ranking is unaffected by them.{" "}
              {formatNumber(data.totals.comparisons)} comparisons recorded.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
