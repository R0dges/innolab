"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Eye,
  ScanSearch,
  Shuffle,
  Sparkles,
  TriangleAlert,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@juryza/ui/components/ui/accordion";
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
  CardFooter,
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
import { Input } from "@juryza/ui/components/ui/input";
import { Label } from "@juryza/ui/components/ui/label";
import { Progress } from "@juryza/ui/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@juryza/ui/components/ui/radio-group";
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
import { api } from "@/lib/api";
import { formatNumber, pluralize } from "@/lib/format";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { eventKey, useEvent } from "@/lib/queries";

/**
 * Assignments: plan which judge reviews which project. The planner previews a
 * run (dry run) before writing it, re-runs only top up coverage, and every plan
 * respects track eligibility and conflicts of interest (lib/assignment.ts).
 * Below, the current assignments grouped by judge and coverage per project.
 */

interface Coverage {
  projects: number;
  fullyCovered: number;
  underCovered: string[];
}
interface AssignmentRow {
  id: string;
  batch: number;
  judgeId: string;
  judgeName: string;
  projectId: string;
  projectTitle: string;
  trackId: string | null;
  scored: boolean;
  scoredAt: string | null;
}
interface Assignments {
  reviewsPerProject: number;
  coverage: Coverage;
  assignments: AssignmentRow[];
}
interface Plan {
  strategy: Strategy;
  reviewsPerProject: number;
  judges: number;
  pairs: number;
  dryRun?: boolean;
  inserted?: number;
  coverage: Coverage;
}
type Strategy = "balanced" | "batch";
interface GalleryProject {
  id: string;
  title: string;
  trackId: string | null;
  trackName: string | null;
}

const STRATEGIES: { value: Strategy; title: string; body: string }[] = [
  {
    value: "balanced",
    title: "Balanced",
    body: "Every project gets the target number of reviews, always from the eligible judges carrying the least work. Projects with the fewest eligible judges are placed first so none are starved.",
  },
  {
    value: "batch",
    title: "Batches",
    body: "Contiguous, human-legible chunks — “judge A takes projects 1–10”. One review per project; good for a quick first pass.",
  },
];

export default function AssignmentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: detail } = useEvent(slug);
  const key = ["assignments", slug];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<Assignments>(`/api/events/${slug}/assignments`),
  });
  const { data: gallery } = useQuery({
    queryKey: ["projects", slug, "all"],
    queryFn: () =>
      api.get<{ projects: GalleryProject[] }>(`/api/events/${slug}/projects?sort=title`),
  });

  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [target, setTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const reviews = target ?? data?.reviewsPerProject ?? 3;
  const trackName = new Map((detail?.tracks ?? []).map((t) => [t.id, t.name]));

  const plan = useMutation({
    mutationFn: (dryRun: boolean) =>
      api.post<Plan>(`/api/events/${slug}/assignments`, {
        strategy,
        reviewsPerProject: reviews,
        dryRun,
      }),
    onSuccess: (res) => {
      if (res.dryRun) {
        setPreview(res);
        return;
      }
      setPreview(null);
      toast.success(
        res.inserted
          ? `Created ${pluralize(res.inserted, "assignment")}`
          : "Nothing to add — coverage is already complete"
      );
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["judges", slug] });
    },
    onError: (e) => toast.error(e.message),
  });

  const release = useMutation({
    mutationFn: () => api.delete<{ removed: number }>(`/api/events/${slug}/assignments`),
    onSuccess: (res) => {
      toast.success(`Released ${pluralize(res.removed, "unscored assignment")}`);
      setConfirmRelease(false);
      setPreview(null);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["judges", slug] });
      qc.invalidateQueries({ queryKey: eventKey(slug) });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.assignments ?? [];
  const scored = rows.filter((r) => r.scored).length;
  const unscored = rows.length - scored;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assignments"
        description="Decide who reviews what. Preview a plan, then write it — re-running only fills gaps, it never duplicates."
        actions={
          <Button variant="outline" disabled={!unscored} onClick={() => setConfirmRelease(true)}>
            <Undo2 /> Release unscored
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Assignments"
          value={isLoading ? "…" : formatNumber(rows.length)}
          icon={Shuffle}
        />
        <StatCard
          label="Scored"
          value={isLoading ? "…" : formatNumber(scored)}
          hint={
            rows.length ? `${Math.round((scored / rows.length) * 100)}% of assignments` : undefined
          }
        />
        <StatCard
          label="Fully covered"
          value={
            isLoading
              ? "…"
              : `${data?.coverage.fullyCovered ?? 0} / ${data?.coverage.projects ?? 0}`
          }
          hint={`projects with ≥ ${data?.reviewsPerProject ?? "…"} reviews assigned`}
        />
        <StatCard
          label="Under-covered"
          value={isLoading ? "…" : (data?.coverage.underCovered.length ?? 0)}
          hint="projects below the target"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4" /> Assignment planner
            </CardTitle>
            <CardDescription>Choose a strategy, preview the result, then generate.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <RadioGroup
              value={strategy}
              onValueChange={(v) => {
                setStrategy(v as Strategy);
                setPreview(null);
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              {STRATEGIES.map((s) => (
                <Label
                  key={s.value}
                  className={cn(
                    "hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal",
                    strategy === s.value && "border-primary/50 bg-primary/5"
                  )}
                >
                  <RadioGroupItem value={s.value} className="mt-0.5" />
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-muted-foreground text-xs leading-relaxed">{s.body}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reviews">Reviews per project</Label>
                <Input
                  id="reviews"
                  type="number"
                  min={1}
                  max={10}
                  className="w-28 tabular-nums"
                  disabled={strategy === "batch"}
                  value={reviews}
                  onChange={(e) => {
                    setTarget(Math.max(1, Math.min(10, e.target.valueAsNumber || 1)));
                    setPreview(null);
                  }}
                />
              </div>
              <p className="text-muted-foreground max-w-sm text-xs">
                {strategy === "batch"
                  ? "Batches give each project a single review."
                  : `Event default is ${data?.reviewsPerProject ?? "…"} (set in Details & dates). Three or more lets normalization cancel out a single harsh or generous judge.`}
              </p>
            </div>

            {preview && <PlanPreview plan={preview} />}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={plan.isPending} onClick={() => plan.mutate(true)}>
              {plan.isPending && plan.variables ? <Spinner /> : <Eye />} Preview
            </Button>
            <Button disabled={plan.isPending} onClick={() => plan.mutate(false)}>
              {plan.isPending && !plan.variables ? <Spinner /> : <Sparkles />} Generate assignments
            </Button>
          </CardFooter>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanSearch className="size-4" /> Rules every plan follows
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p>
              <span className="text-foreground font-medium">Conflicts of interest.</span> A judge is
              never assigned a project built by a team they belong to.
            </p>
            {EVENT_TRACKS_ENABLED && (
              <p>
                <span className="text-foreground font-medium">Track eligibility.</span> Judges
                limited to certain tracks only get projects from those tracks — and the API
                re-checks this when they score.
              </p>
            )}
            <p>
              <span className="text-foreground font-medium">Idempotent.</span> Existing assignments
              count toward each project's target and each judge's load, so re-running tops up
              instead of piling on.
            </p>
            <p>
              <span className="text-foreground font-medium">Scores are sacred.</span> Releasing only
              removes assignments that have no score yet.
            </p>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load assignments</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <Tabs defaultValue="projects">
          <TabsList>
            <TabsTrigger value="projects">By project</TabsTrigger>
            <TabsTrigger value="judges">By judge</TabsTrigger>
          </TabsList>
          <TabsContent value="projects" className="pt-2">
            <ProjectCoverage
              slug={slug}
              data={data}
              gallery={gallery?.projects ?? []}
              trackName={trackName}
            />
          </TabsContent>
          <TabsContent value="judges" className="pt-2">
            <ByJudge rows={rows} />
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Release {pluralize(unscored, "unscored assignment")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every assignment without a score is removed, freeing those projects for a fresh plan.
              The {scored} scored assignment(s) and their scores are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={release.isPending}
              onClick={() => release.mutate()}
            >
              {release.isPending && <Spinner />} Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanPreview({ plan }: { plan: Plan }) {
  const { coverage: c } = plan;
  const pct = c.projects ? Math.round((c.fullyCovered / c.projects) * 100) : 0;
  return (
    <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Eye className="size-4" /> Preview — nothing written yet
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">New pairs</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatNumber(plan.pairs)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Judges used</dt>
          <dd className="text-lg font-semibold tabular-nums">{plan.judges}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Coverage after</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {c.fullyCovered}/{c.projects}
          </dd>
        </div>
      </dl>
      <Progress value={pct} aria-label={`${pct}% of projects fully covered`} />
      {c.underCovered.length > 0 ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <TriangleAlert className="text-warning mt-px size-3.5 shrink-0" />
          {pluralize(c.underCovered.length, "project")} would still be below{" "}
          {plan.reviewsPerProject} reviews — usually too few eligible judges or conflicts of
          interest. Add judges or lower the target.
        </p>
      ) : (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <CheckCircle2 className="text-success size-3.5" /> Every project reaches the target.
        </p>
      )}
    </div>
  );
}

function ProjectCoverage({
  slug,
  data,
  gallery,
  trackName,
}: {
  slug: string;
  data: Assignments;
  gallery: GalleryProject[];
  trackName: Map<string, string>;
}) {
  const target = data.reviewsPerProject;
  const by = new Map<
    string,
    { title: string; trackId: string | null; assigned: number; scored: number; judges: string[] }
  >();
  for (const p of gallery)
    by.set(p.id, { title: p.title, trackId: p.trackId, assigned: 0, scored: 0, judges: [] });
  for (const a of data.assignments) {
    const row = by.get(a.projectId) ?? {
      title: a.projectTitle,
      trackId: a.trackId,
      assigned: 0,
      scored: 0,
      judges: [],
    };
    row.assigned += 1;
    if (a.scored) row.scored += 1;
    row.judges.push(a.judgeName);
    by.set(a.projectId, row);
  }
  const list = [...by.entries()].sort(
    (a, b) => a[1].assigned - b[1].assigned || a[1].title.localeCompare(b[1].title)
  );

  if (list.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shuffle />
          </EmptyMedia>
          <EmptyTitle>No submitted projects</EmptyTitle>
          <EmptyDescription>Assignments are planned over submitted projects only.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Card className="py-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Project</TableHead>
              {EVENT_TRACKS_ENABLED && <TableHead>Track</TableHead>}
              <TableHead className="text-right">Assigned / target</TableHead>
              <TableHead className="text-right">Scored</TableHead>
              <TableHead>Judges</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map(([id, p]) => (
              <TableRow key={id}>
                <TableCell className="max-w-64 truncate pl-4 font-medium">
                  <Link href={`/e/${slug}/projects/${id}`} className="hover:underline">
                    {p.title}
                  </Link>
                </TableCell>
                {EVENT_TRACKS_ENABLED && (
                  <TableCell className="text-muted-foreground">
                    {p.trackId ? (trackName.get(p.trackId) ?? "—") : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  <span className={cn(p.assigned < target && "text-destructive font-medium")}>
                    {p.assigned}
                  </span>
                  <span className="text-muted-foreground"> / {target}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.scored}</TableCell>
                <TableCell className="text-muted-foreground max-w-72 truncate text-xs">
                  {p.judges.join(", ") || "—"}
                </TableCell>
                <TableCell className="pr-4">
                  {p.assigned < target ? (
                    <Badge variant="destructive">Under-covered</Badge>
                  ) : p.scored >= target ? (
                    <Badge className="bg-success text-success-foreground">Complete</Badge>
                  ) : (
                    <Badge variant="secondary">In review</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ByJudge({ rows }: { rows: AssignmentRow[] }) {
  const byJudge = new Map<string, { name: string; items: AssignmentRow[] }>();
  for (const r of rows) {
    const g = byJudge.get(r.judgeId) ?? { name: r.judgeName, items: [] };
    g.items.push(r);
    byJudge.set(r.judgeId, g);
  }
  const groups = [...byJudge.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (groups.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shuffle />
          </EmptyMedia>
          <EmptyTitle>No assignments yet</EmptyTitle>
          <EmptyDescription>Preview a plan above, then generate it.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Card className="py-0">
      <Accordion className="px-4">
        {groups.map(([id, g]) => {
          const done = g.items.filter((i) => i.scored).length;
          const pct = Math.round((done / g.items.length) * 100);
          return (
            <AccordionItem key={id} value={id}>
              <AccordionTrigger className="items-center gap-4 hover:no-underline">
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="hidden w-32 sm:block">
                  <Progress value={pct} aria-label={`${pct}% scored`} />
                </span>
                <span className="text-muted-foreground w-16 text-right text-xs tabular-nums">
                  {done}/{g.items.length}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-1 pb-2">
                  {g.items
                    .sort(
                      (a, b) => a.batch - b.batch || a.projectTitle.localeCompare(b.projectTitle)
                    )
                    .map((i) => (
                      <li key={i.id} className="flex items-center gap-2 text-sm">
                        {i.scored ? (
                          <CheckCircle2
                            className="text-success size-4 shrink-0"
                            aria-label="Scored"
                          />
                        ) : (
                          <Circle
                            className="text-muted-foreground size-4 shrink-0"
                            aria-label="Not scored"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{i.projectTitle}</span>
                        {i.batch > 1 && (
                          <span className="text-muted-foreground text-xs">batch {i.batch}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
}
