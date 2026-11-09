"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, ListChecks, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Input } from "@juryza/ui/components/ui/input";
import { Label } from "@juryza/ui/components/ui/label";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Slider } from "@juryza/ui/components/ui/slider";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Textarea } from "@juryza/ui/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@juryza/ui/components/ui/tooltip";
import { cn } from "@juryza/ui/lib/utils";

import { PageHeader } from "@/components/page";
import { api } from "@/lib/api";
import { eventKey } from "@/lib/queries";
import type { Json, RubricCriterion } from "@/lib/types";

/**
 * Rubric viewer and admin-only editor. Weights are relative, so the page shows
 * each one's normalized share live; saving replaces the rubric and results
 * recompute on read because marks are stored per criterion.
 */

const MAX = 12;

interface Row {
  uid: string;
  key: string;
  label: string;
  description: string;
  weight: number;
  saved: boolean;
}

const toRows = (criteria: Json<RubricCriterion>[]): Row[] =>
  criteria.map((c) => ({
    uid: c.id,
    key: c.key,
    label: c.label,
    description: c.description ?? "",
    weight: c.weight,
    saved: true,
  }));

/** "Code quality" → "code_quality"; always a valid, unique key. */
function deriveKey(label: string, taken: Set<string>) {
  let base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 28);
  if (!base) base = "criterion";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  return key;
}

const same = (a: Row[], b: Row[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.key === b[i]?.key &&
      r.label === b[i]?.label &&
      r.description === b[i]?.description &&
      r.weight === b[i]?.weight
  );

export default function RubricPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rubric", slug],
    queryFn: () =>
      api.get<{
        criteria: Json<RubricCriterion>[];
        revision: number;
        locked: boolean;
        editable: boolean;
      }>(`/api/events/${slug}/rubric`),
  });
  const canEdit = data?.editable ?? false;

  const [draft, setDraft] = useState<Row[] | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const saved = data ? toRows(data.criteria) : [];
  const rows = draft ?? saved;
  const dirty = draft !== null && !same(draft, saved);

  const total = rows.reduce((n, r) => n + (r.weight > 0 ? r.weight : 0), 0);
  const share = (r: Row) => (total > 0 && r.weight > 0 ? r.weight / total : 0);
  const problems = [
    rows.some((r) => !r.label.trim()) && "Every criterion needs a label.",
    rows.some((r) => !(r.weight > 0)) && "Weights must be greater than zero.",
    new Set(rows.map((r) => r.key)).size !== rows.length && "Two criteria share a key.",
  ].filter(Boolean) as string[];

  const update = (uid: string, patch: Partial<Row>) =>
    setDraft(
      rows.map((r) => {
        if (r.uid !== uid) return r;
        const next = { ...r, ...patch };
        if (!r.saved && patch.label !== undefined) {
          next.key = deriveKey(
            patch.label,
            new Set(rows.filter((x) => x.uid !== uid).map((x) => x.key))
          );
        }
        return next;
      })
    );

  const add = () => {
    const taken = new Set(rows.map((r) => r.key));
    const uid = `new-${Date.now().toString(36)}-${rows.length}`;
    setDraft([
      ...rows,
      {
        uid,
        key: deriveKey("New criterion", taken),
        label: "",
        description: "",
        weight: 1,
        saved: false,
      },
    ]);
    setFocus(uid);
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<{
        criteria: Json<RubricCriterion>[];
        revision: number;
        locked: boolean;
        editable: boolean;
      }>(`/api/events/${slug}/rubric`, {
        revision: data?.revision ?? 0,
        criteria: rows.map((r) => ({
          key: r.key,
          label: r.label.trim(),
          description: r.description.trim() || null,
          weight: r.weight,
        })),
      }),
    onSuccess: (res) => {
      qc.setQueryData(["rubric", slug], res);
      qc.invalidateQueries({ queryKey: eventKey(slug) });
      qc.invalidateQueries({ queryKey: ["results", slug] });
      setDraft(null);
      toast.success("Grille enregistrée");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rubric"
        description="The criteria judges mark every project on, and how much each one counts."
        actions={
          canEdit ? (
            <>
              <Button
                variant="outline"
                disabled={!dirty || save.isPending}
                onClick={() => setDraft(null)}
              >
                <RotateCcw /> Discard
              </Button>
              <Button
                disabled={!dirty || problems.length > 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? <Spinner /> : <Save />} Save rubric
              </Button>
            </>
          ) : (
            <Badge variant="secondary">
              <Lock /> Read only
            </Badge>
          )
        }
      />

      {data?.locked ? (
        <Alert>
          <Lock />
          <AlertTitle>Grille verrouillée lors de la Promotion</AlertTitle>
          <AlertDescription>
            Les critères restent consultables, mais ne peuvent plus être modifiés après le passage
            des pitchs aux projets.
          </AlertDescription>
        </Alert>
      ) : !canEdit && data ? (
        <Alert>
          <Lock />
          <AlertTitle>Lecture seule</AlertTitle>
          <AlertDescription>
            Seuls les coachs rattachés à cet événement peuvent modifier la grille.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load the rubric</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weight distribution</CardTitle>
                <CardDescription>
                  Each criterion's share of a judge's score. Weights are relative — only their
                  proportions matter.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <WeightBar rows={rows} share={share} focus={focus} onFocus={setFocus} />
                {problems.length > 0 && (
                  <ul className="text-destructive flex flex-col gap-0.5 text-xs">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {rows.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListChecks />
                  </EmptyMedia>
                  <EmptyTitle>No criteria yet</EmptyTitle>
                  <EmptyDescription>
                    A rubric needs at least one criterion before judges can score.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ol className="flex flex-col gap-3">
                {rows.map((r, i) => (
                  <li key={r.uid}>
                    <Card
                      className={cn(
                        "gap-4 py-4 transition-shadow",
                        focus === r.uid && "ring-primary/40 ring-2"
                      )}
                      onFocusCapture={() => setFocus(r.uid)}
                      onMouseEnter={() => setFocus(r.uid)}
                    >
                      <CardContent className="flex flex-col gap-4 px-4">
                        <div className="flex items-start gap-3">
                          <span className="bg-muted text-muted-foreground mt-6 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium tabular-nums">
                            {i + 1}
                          </span>
                          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_auto]">
                            <div className="flex flex-col gap-1.5">
                              <Label htmlFor={`label-${r.uid}`}>Label</Label>
                              <Input
                                id={`label-${r.uid}`}
                                value={r.label}
                                disabled={!canEdit}
                                maxLength={60}
                                placeholder="e.g. Technical execution"
                                autoFocus={!r.saved && focus === r.uid}
                                aria-invalid={!r.label.trim() || undefined}
                                onChange={(e) => update(r.uid, { label: e.target.value })}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-sm leading-none font-medium">Key</span>
                              <KeyChip row={r} />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="mt-6"
                            aria-label={`Remove ${r.label || "criterion"}`}
                            disabled={!canEdit || rows.length <= 1}
                            onClick={() => setDraft(rows.filter((x) => x.uid !== r.uid))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <div className="flex flex-col gap-1.5 sm:pl-9">
                          <Label htmlFor={`desc-${r.uid}`}>Guidance for judges</Label>
                          <Textarea
                            id={`desc-${r.uid}`}
                            value={r.description}
                            disabled={!canEdit}
                            maxLength={400}
                            rows={2}
                            placeholder="What does a 5 look like? What does a 1 look like?"
                            onChange={(e) => update(r.uid, { description: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:pl-9">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor={`weight-${r.uid}`}>Weight</Label>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {(share(r) * 100).toFixed(1)}% of the score
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <Slider
                              aria-label={`Weight for ${r.label || "criterion"}`}
                              disabled={!canEdit}
                              min={0.5}
                              max={10}
                              step={0.5}
                              value={[Math.min(10, Math.max(0.5, r.weight))]}
                              onValueChange={(v) =>
                                update(r.uid, {
                                  weight: Array.isArray(v) ? (v[0] ?? 1) : (v as number),
                                })
                              }
                            />
                            <Input
                              id={`weight-${r.uid}`}
                              type="number"
                              disabled={!canEdit}
                              inputMode="decimal"
                              min={0.1}
                              max={100}
                              step={0.1}
                              className="w-20 tabular-nums"
                              value={Number.isFinite(r.weight) ? r.weight : ""}
                              aria-invalid={!(r.weight > 0) || undefined}
                              onChange={(e) => update(r.uid, { weight: e.target.valueAsNumber })}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ol>
            )}

            <Button
              variant="outline"
              className="self-start"
              disabled={!canEdit || rows.length >= MAX}
              onClick={add}
            >
              <Plus /> Add criterion
              <span className="text-muted-foreground tabular-nums">
                {rows.length}/{MAX}
              </span>
            </Button>
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="text-muted-foreground size-4" /> How scores are computed
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                <p>
                  Judges mark each criterion from 1 to 5. A judge's score for a project is the{" "}
                  <span className="text-foreground font-medium">weighted mean</span> of those marks,
                  with the weights scaled to add up to 100%.
                </p>
                <p className="bg-muted text-foreground rounded-md px-3 py-2 font-mono text-xs leading-relaxed">
                  score = Σ (mark × weight) ÷ Σ weight
                </p>
                <p>
                  Weights <span className="text-foreground font-medium">2, 1, 1</span> and{" "}
                  <span className="text-foreground font-medium">50, 25, 25</span> are identical: 50%
                  / 25% / 25%.
                </p>
                <p>
                  Marks are stored per criterion and nothing is pre-aggregated, so re-weighting{" "}
                  <span className="text-foreground font-medium">
                    recomputes every result instantly
                  </span>{" "}
                  — no judge has to re-score.
                </p>
              </CardContent>
            </Card>
            <Alert>
              <Lock />
              <AlertTitle>Keys are permanent</AlertTitle>
              <AlertDescription>
                A key is derived from the label when you add a criterion and locks once saved —
                judges' marks are stored against it. Renaming the label is always safe. Removing a
                criterion stops its marks counting.
              </AlertDescription>
            </Alert>
          </aside>
        </div>
      )}
    </div>
  );
}

function KeyChip({ row }: { row: Row }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="bg-muted/60 text-muted-foreground inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs" />
        }
      >
        {row.saved ? <Lock className="size-3" /> : <Badge variant="secondary">new</Badge>}
        {row.key}
      </TooltipTrigger>
      <TooltipContent>
        {row.saved
          ? "Locked: judges' marks are stored against this key."
          : "Derived from the label. It locks when you save."}
      </TooltipContent>
    </Tooltip>
  );
}

/** One bar split into each criterion's normalized share; hover a segment to see it. */
function WeightBar({
  rows,
  share,
  focus,
  onFocus,
}: {
  rows: Row[];
  share: (r: Row) => number;
  focus: string | null;
  onFocus: (uid: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="bg-muted flex h-8 w-full gap-0.5 overflow-hidden rounded-md"
        role="img"
        aria-label="Weight distribution"
      >
        {rows.map((r, i) => {
          const pct = share(r) * 100;
          if (pct <= 0) return null;
          return (
            <Tooltip key={r.uid} onOpenChange={(open) => open && onFocus(r.uid)}>
              <TooltipTrigger
                render={
                  <div
                    className={cn(
                      "bg-primary text-primary-foreground flex h-full min-w-0 items-center justify-center text-xs font-medium tabular-nums transition-opacity",
                      focus && focus !== r.uid ? "opacity-45" : "opacity-100"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                }
              >
                {pct >= 9 ? `${Math.round(pct)}%` : null}
              </TooltipTrigger>
              <TooltipContent>
                {i + 1}. {r.label || "Untitled"} — {pct.toFixed(1)}%
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={r.uid}
            className={cn("flex items-center gap-2", focus === r.uid && "font-medium")}
          >
            <span className="text-muted-foreground w-4 text-right text-xs tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{r.label || "Untitled"}</span>
            <span className="text-muted-foreground tabular-nums">
              {(share(r) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
