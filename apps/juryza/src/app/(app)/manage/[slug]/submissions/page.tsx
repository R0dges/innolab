"use client";

/**
 * /manage/<slug>/submissions — every project in the event, drafts included,
 * with status/track/search filters, plus automatic duplicate and look-alike
 * detection (GET /api/events/:slug/similarity) with a tunable threshold.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Copy,
  Download,
  ExternalLink,
  FolderGit2,
  FolderKanban,
  GitCompareArrows,
  Globe,
  PlayCircle,
  ScanSearch,
  Search,
  TriangleAlert,
} from "lucide-react";

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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@juryza/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Slider } from "@juryza/ui/components/ui/slider";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@juryza/ui/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@juryza/ui/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@juryza/ui/components/ui/tooltip";
import { cn } from "@juryza/ui/lib/utils";

import { api } from "@/lib/api";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/format";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { eventKey, useEvent } from "@/lib/queries";

/** A row of the `projects` export (JSON form). */
interface ProjectRecord {
  project_id: string;
  title: string;
  tagline: string | null;
  status: "draft" | "submitted";
  track: string | null;
  team: string | null;
  repo_url: string | null;
  live_url: string | null;
  video_url: string | null;
  tech_tags: string;
  submitted_at: string | null;
  updated_at: string;
}

interface PairSide {
  id: string;
  title: string;
  teamName: string | null;
  repoUrl: string | null;
  submittedAt: string | null;
}
interface Similarity {
  threshold: number;
  scanned: number;
  pairs: { a: PairSide; b: PairSide; score: number; reasons: string[]; sharedTerms: string[] }[];
}

type Status = "all" | "submitted" | "draft";
const STRONG = new Set(["Same repository URL", "Identical title"]);
const ALL_TRACKS = "__all";

export default function SubmissionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const event = useEvent(slug);
  const { data, isLoading, error } = useQuery({
    queryKey: [...eventKey(slug), "projects-all"],
    queryFn: () =>
      api.get<ProjectRecord[]>(`/api/events/${slug}/export?dataset=projects&format=json`),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [status, setStatus] = useState<Status>("all");
  const [track, setTrack] = useState<string>(ALL_TRACKS);
  const [q, setQ] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [committed, setCommitted] = useState(0.5);

  const similarity = useQuery({
    queryKey: [...eventKey(slug), "similarity", committed],
    queryFn: () => api.get<Similarity>(`/api/events/${slug}/similarity?threshold=${committed}`),
    placeholderData: keepPreviousData,
  });

  const projects = data ?? [];
  const counts = {
    all: projects.length,
    submitted: projects.filter((p) => p.status === "submitted").length,
    draft: projects.filter((p) => p.status === "draft").length,
  };
  const needle = q.trim().toLowerCase();
  const rows = projects.filter(
    (p) =>
      (status === "all" || p.status === status) &&
      (track === ALL_TRACKS || (p.track ?? "") === track) &&
      (!needle ||
        p.title.toLowerCase().includes(needle) ||
        (p.team ?? "").toLowerCase().includes(needle) ||
        p.tech_tags.toLowerCase().includes(needle))
  );
  const flagged = new Map<string, string>();
  for (const pair of similarity.data?.pairs ?? []) {
    if (pair.reasons.some((r) => STRONG.has(r))) {
      flagged.set(pair.a.id, pair.b.title);
      flagged.set(pair.b.id, pair.a.title);
    }
  }
  const trackNames = (event.data?.tracks ?? []).map((t) => t.name);
  const trackItems = {
    [ALL_TRACKS]: "All tracks",
    ...Object.fromEntries(trackNames.map((n) => [n, n])),
  };

  return (
    <div className="flex flex-col gap-8">
      <DuplicatesPanel
        slug={slug}
        data={similarity.data}
        loading={similarity.isLoading}
        fetching={similarity.isFetching}
        error={similarity.error}
        threshold={threshold}
        onThreshold={setThreshold}
        onCommit={setCommitted}
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
            <p className="text-muted-foreground text-sm">
              Every project in the event, including drafts that aren't public yet.
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/api/events/${slug}/export?dataset=projects&format=csv`} download />}
          >
            <Download /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
            <TabsList>
              {(["all", "submitted", "draft"] as const).map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s === "draft" ? "Drafts" : s}
                  <span className="text-muted-foreground tabular-nums">{counts[s]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {trackNames.length > 0 && (
              <Select
                value={track}
                items={trackItems}
                onValueChange={(v) => setTrack(v ?? ALL_TRACKS)}
              >
                <SelectTrigger className="w-44" aria-label="Filter by track">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TRACKS}>All tracks</SelectItem>
                  {trackNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Title, team or tech…"
                aria-label="Search projects"
              />
            </InputGroup>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load projects</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : projects.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderKanban />
              </EmptyMedia>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Projects appear here as soon as a team starts one — drafts included.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Team</TableHead>
                    {EVENT_TRACKS_ENABLED && <TableHead>Track</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Submitted</TableHead>
                    <TableHead className="text-right">Links</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const dupOf = flagged.get(p.project_id);
                    return (
                      <TableRow key={p.project_id} className={cn(dupOf && "bg-destructive/5")}>
                        <TableCell className="max-w-72">
                          <div className="flex items-center gap-2">
                            {p.status === "submitted" ? (
                              <Link
                                href={`/e/${slug}/projects/${p.project_id}`}
                                className="truncate font-medium hover:underline"
                              >
                                {p.title}
                              </Link>
                            ) : (
                              <span className="truncate font-medium">{p.title}</span>
                            )}
                            {dupOf && (
                              <Tooltip>
                                <TooltipTrigger render={<Badge variant="destructive" />}>
                                  <Copy /> Duplicate?
                                </TooltipTrigger>
                                <TooltipContent>
                                  Looks like “{dupOf}” — see Duplicates above
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {p.tagline && (
                            <p className="text-muted-foreground truncate text-xs">{p.tagline}</p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {p.team ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        {EVENT_TRACKS_ENABLED && (
                          <TableCell className="whitespace-nowrap">
                            {p.track ? (
                              <Badge variant="outline">{p.track}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge
                            variant={p.status === "submitted" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap tabular-nums">
                          {p.submitted_at ? (
                            <span title={relativeTime(p.submitted_at)}>
                              {formatDateTime(p.submitted_at)}
                            </span>
                          ) : (
                            `edited ${relativeTime(p.updated_at)}`
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-0.5">
                            <LinkIcon href={p.repo_url} label="Repository" icon={FolderGit2} />
                            <LinkIcon href={p.live_url} label="Live demo" icon={Globe} />
                            <LinkIcon href={p.video_url} label="Video" icon={PlayCircle} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                        No projects match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground border-t px-4 py-2 text-xs tabular-nums">
              Showing {formatNumber(rows.length)} of {formatNumber(projects.length)}
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}

function LinkIcon({
  href,
  label,
  icon: Icon,
}: {
  href: string | null;
  label: string;
  icon: React.ComponentType;
}) {
  if (!href) return <span className="size-7" aria-hidden />;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noreferrer" />}
    >
      <Icon />
    </Button>
  );
}

function DuplicatesPanel({
  slug,
  data,
  loading,
  fetching,
  error,
  threshold,
  onThreshold,
  onCommit,
}: {
  slug: string;
  data: Similarity | undefined;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  threshold: number;
  onThreshold: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const pairs = data?.pairs ?? [];
  const strong = pairs.filter((p) => p.reasons.some((r) => STRONG.has(r)));
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearch className="size-4" /> Duplicates & look-alikes
          {fetching && <Spinner className="size-3.5" />}
        </CardTitle>
        <CardDescription>
          Every pair of submitted projects compared by repository, title, write-up and tags.{" "}
          {data && `${formatNumber(data.scanned)} projects scanned.`}
        </CardDescription>
        <CardAction className="hidden sm:block">
          <Badge variant={strong.length ? "destructive" : "secondary"} className="tabular-nums">
            {strong.length
              ? `${strong.length} likely duplicate${strong.length === 1 ? "" : "s"}`
              : "No exact duplicates"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4">
          <label htmlFor="threshold" className="shrink-0 text-sm font-medium">
            Similarity threshold
          </label>
          <Slider
            id="threshold"
            min={0.3}
            max={0.9}
            step={0.05}
            value={threshold}
            aria-label="Similarity threshold"
            onValueChange={(v) => onThreshold(Array.isArray(v) ? (v[0] ?? 0.5) : v)}
            onValueCommitted={(v) => onCommit(Array.isArray(v) ? (v[0] ?? 0.5) : v)}
          />
          <span className="w-24 shrink-0 text-sm tabular-nums sm:text-right">
            ≥ {Math.round(threshold * 100)}% ·{" "}
            <span className="text-muted-foreground">{pairs.length} pairs</span>
          </span>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : pairs.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No pairs above {Math.round(threshold * 100)}% similarity. Lower the threshold to see
            looser look-alikes.
          </p>
        ) : (
          <>
            {strong.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                  {strong.length} pair{strong.length === 1 ? " looks" : "s look"} like the same
                  project submitted twice
                </AlertTitle>
                <AlertDescription>
                  Same repository or identical title. Compare them, then keep one — judges may
                  otherwise score it twice.
                </AlertDescription>
              </Alert>
            )}
            <ul className="grid gap-3 md:grid-cols-2">
              {pairs.slice(0, 24).map((p) => {
                const isStrong = p.reasons.some((r) => STRONG.has(r));
                const pct = Math.round(p.score * 100);
                return (
                  <li key={`${p.a.id}-${p.b.id}`}>
                    <div
                      className={cn(
                        "flex h-full flex-col gap-3 rounded-lg border p-3",
                        isStrong && "border-destructive/50 bg-destructive/5"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
                          aria-hidden
                        >
                          <div
                            className={cn(
                              "h-full rounded-full",
                              isStrong ? "bg-destructive" : "bg-chart-1"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-sm font-semibold tabular-nums">
                          {pct}%
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                        <Side slug={slug} side={p.a} />
                        <GitCompareArrows
                          className="text-muted-foreground mt-1 size-4"
                          aria-hidden
                        />
                        <Side slug={slug} side={p.b} />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {p.reasons.map((r) => (
                          <Badge key={r} variant={STRONG.has(r) ? "destructive" : "secondary"}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                      {p.sharedTerms.length > 0 && (
                        <p className="text-muted-foreground text-xs">
                          Shared terms:{" "}
                          {p.sharedTerms.map((t) => (
                            <code
                              key={t}
                              className="bg-muted mr-1 rounded px-1 py-0.5 font-mono text-[0.7rem]"
                            >
                              {t}
                            </code>
                          ))}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant={isStrong ? "default" : "outline"}
                        className="mt-auto self-start"
                        nativeButton={false}
                        render={<Link href={`/e/${slug}/compare?ids=${p.a.id},${p.b.id}`} />}
                      >
                        <GitCompareArrows /> Compare side by side
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {pairs.length > 24 && (
              <p className="text-muted-foreground text-center text-xs">
                Showing the 24 most similar of {pairs.length} pairs — raise the threshold to narrow
                it down.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Side({ slug, side }: { slug: string; side: PairSide }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/e/${slug}/projects/${side.id}`}
        className="flex items-center gap-1 text-sm font-medium hover:underline"
      >
        <span className="truncate">{side.title}</span>
        <ExternalLink className="text-muted-foreground size-3 shrink-0" />
      </Link>
      <p className="text-muted-foreground truncate text-xs">{side.teamName ?? "No team"}</p>
      {side.submittedAt && (
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          {formatDateTime(side.submittedAt)}
        </p>
      )}
    </div>
  );
}
