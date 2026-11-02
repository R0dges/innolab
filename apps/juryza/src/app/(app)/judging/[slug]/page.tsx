"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  FolderGit2,
  Gavel,
  Globe,
  Heart,
  Lock,
  Search,
  ShieldCheck,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent } from "@juryza/ui/components/ui/card";
import { Checkbox } from "@juryza/ui/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@juryza/ui/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@juryza/ui/components/ui/input-group";
import { Kbd } from "@juryza/ui/components/ui/kbd";
import { Progress } from "@juryza/ui/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Separator } from "@juryza/ui/components/ui/separator";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@juryza/ui/components/ui/tabs";
import { Textarea } from "@juryza/ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@juryza/ui/components/ui/toggle-group";
import { cn } from "@juryza/ui/lib/utils";

import { RichContent } from "@/components/editor/rich-content";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/format";
import { rawScore } from "@/lib/scoring";
import type { Json, RichDoc, RubricCriterion } from "@/lib/types";

/**
 * The scoring console. Left: the judge's assigned projects (search, filter,
 * status). Right: the selected project and the rubric — one 1–5 scale per
 * criterion, fully keyboard-driven (1–5 to mark, ↑/↓ to move between
 * criteria, ⌘↵ to save and jump to the next unscored project), with a live
 * weighted score. Scores are only ever the caller's own: the API scopes every
 * read and write to the signed-in judge.
 */

interface QueueItem {
  projectId: string;
  title: string;
  tagline: string | null;
  description: string | null;
  content: RichDoc | null;
  thumbnailUrl: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  videoUrl: string | null;
  techTags: string[];
  trackName: string | null;
  batch: number;
  criteria: Record<string, number> | null;
  favorite: boolean | null;
  comment: string | null;
  scoredAt: string | null;
  scored: boolean;
}

interface QueueDetail {
  event: { id: string; slug: string; name: string; judgingClose: string | null; hue: number };
  locked: boolean;
  criteria: Json<RubricCriterion>[];
  total: number;
  scored: number;
  items: QueueItem[];
}

type Filter = "all" | "todo" | "done";
interface Draft {
  marks: Record<string, number>;
  favorite: boolean;
  comment: string;
}

const SCALE = [
  { value: 1, label: "Insuffisant" },
  { value: 2, label: "Passable" },
  { value: 3, label: "Bon" },
  { value: 4, label: "Très bon" },
  { value: 5, label: "Excellent" },
];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export default function ScoringConsolePage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const key = ["judge", "queue", slug];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<QueueDetail>(`/api/judge/queue?event=${encodeURIComponent(slug)}`),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);

  const items = data?.items ?? [];
  const criteria = data?.criteria ?? [];
  const locked = data?.locked ?? false;
  const current =
    items.find((i) => i.projectId === selectedId) ??
    items.find((i) => !i.scored) ??
    items[0] ??
    null;
  const draft: Draft = current
    ? (drafts[current.projectId] ?? {
        marks: current.criteria ?? {},
        favorite: current.favorite ?? false,
        comment: current.comment ?? "",
      })
    : { marks: {}, favorite: false, comment: "" };
  const complete = criteria.length > 0 && criteria.every((c) => draft.marks[c.key] !== undefined);
  const preview = rawScore(draft.marks, criteria, draft.favorite);
  const totalWeight = criteria.reduce((n, c) => n + c.weight, 0) || 1;
  const dirty =
    current !== null &&
    drafts[current.projectId] !== undefined &&
    (JSON.stringify(draft.marks) !== JSON.stringify(current.criteria ?? {}) ||
      draft.favorite !== (current.favorite ?? false) ||
      draft.comment !== (current.comment ?? ""));

  const needle = q.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (filter === "all" || (filter === "done" ? i.scored : !i.scored)) &&
      (!needle ||
        i.title.toLowerCase().includes(needle) ||
        (i.trackName ?? "").toLowerCase().includes(needle) ||
        i.techTags.some((t) => t.toLowerCase().includes(needle)))
  );

  const select = (projectId: string) => {
    setSelectedId(projectId);
    setActive(0);
    detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const update = (patch: Partial<Draft>) => {
    if (!current || locked) return;
    setDrafts((d) => ({ ...d, [current.projectId]: { ...draft, ...patch } }));
  };
  const mark = (criterionKey: string, value: number) =>
    update({ marks: { ...draft.marks, [criterionKey]: value } });

  const save = useMutation({
    mutationFn: (v: {
      projectId: string;
      criteria: Record<string, number>;
      favorite: boolean;
      comment: string | null;
    }) => api.post("/api/judge/scores", v),
    onSuccess: (_res, v) => {
      queryClient.setQueryData<QueueDetail>(key, (old) => {
        if (!old) return old;
        const nextItems = old.items.map((i) => {
          if (i.projectId === v.projectId) {
            return {
              ...i,
              criteria: v.criteria,
              favorite: v.favorite,
              comment: v.comment,
              scoredAt: new Date().toISOString(),
              scored: true,
            };
          }
          return v.favorite && i.favorite ? { ...i, favorite: false } : i;
        });
        return { ...old, items: nextItems, scored: nextItems.filter((i) => i.scored).length };
      });
      setDrafts((d) => {
        const { [v.projectId]: _saved, ...rest } = d;
        return rest;
      });
      void queryClient.invalidateQueries({ queryKey: ["judge", "queue"], exact: true });
      void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });

      const idx = items.findIndex((i) => i.projectId === v.projectId);
      const ordered = [...items.slice(idx + 1), ...items.slice(0, idx)];
      const next = ordered.find((i) => !i.scored && i.projectId !== v.projectId);
      if (next) {
      toast.success("Évaluation enregistrée", { description: `Projet suivant : ${next.title}` });
        select(next.projectId);
      } else {
        setSelectedId(v.projectId);
      toast.success("Évaluation enregistrée — tous les projets sont évalués");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!current || !complete || locked || save.isPending) return;
    save.mutate({
      projectId: current.projectId,
      criteria: draft.marks,
      favorite: draft.favorite,
      comment: draft.comment.trim() || null,
    });
  };

  // Keyboard: 1–5 marks the active criterion, ↑/↓ moves, ⌘↵ saves & advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || !criteria.length) return;
      if (/^[1-5]$/.test(e.key)) {
        const c = criteria[active];
        if (!c) return;
        e.preventDefault();
        mark(c.key, Number(e.key));
        setActive((a) => Math.min(a + 1, criteria.length - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, criteria.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-[60vh] rounded-xl" />
          <Skeleton className="h-[60vh] rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Gavel />
          </EmptyMedia>
          <EmptyTitle>Can't open this console</EmptyTitle>
          <EmptyDescription>
            {error?.message ?? "Vous n’êtes peut-être pas coach sur cet événement."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/judging" />}>
            <ArrowLeft /> Évaluations
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const done = items.filter((i) => i.scored).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const batches = [...new Set(visible.map((i) => i.batch))];

  return (
    <div className="flex flex-col gap-6">
      {/* Header + progress */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link
              href="/judging"
              className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Évaluations
            </Link>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{data.event.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
              <Progress value={pct} className="flex-1" aria-label="Progression des évaluations" />
          <span className="shrink-0 text-sm font-medium tabular-nums">
                {done} sur {items.length} évalués
          </span>
        </div>
        {data.event.judgingClose && !locked && (
          <p className="text-muted-foreground -mt-2 text-xs">
            Clôture des évaluations {relativeTime(data.event.judgingClose)} ·{" "}
            {formatDateTime(data.event.judgingClose)}
          </p>
        )}
      </div>

      {locked && (
        <Alert>
          <Lock />
          <AlertTitle>Les évaluations sont closes</AlertTitle>
          <AlertDescription>
                Les notes sont définitives : vous pouvez les consulter, mais plus les modifier.
          </AlertDescription>
        </Alert>
      )}

      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Gavel />
            </EmptyMedia>
            <EmptyTitle>Nothing assigned yet</EmptyTitle>
            <EmptyDescription>
              Tous les coachs évalueront tous les projets à la fin de la période de réalisation.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Mobile picker */}
          <div className="lg:hidden">
            <Select
              items={items.map((i) => ({
                value: i.projectId,
                label: `${i.scored ? "✓ " : ""}${i.title}`,
              }))}
              value={current?.projectId ?? null}
              onValueChange={(v) => v && select(v)}
            >
              <SelectTrigger className="w-full" aria-label="Choose a project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.projectId} value={i.projectId}>
                    {i.scored ? "✓ " : ""}
                    {i.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Project list */}
          <Card className="hidden gap-0 py-0 lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100svh-6.5rem)]">
            <div className="flex flex-col gap-2 border-b p-3">
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher un projet…"
                  aria-label="Rechercher un projet"
                />
              </InputGroup>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList className="w-full">
                  <TabsTrigger value="all">All {items.length}</TabsTrigger>
                <TabsTrigger value="todo">À faire {items.length - done}</TabsTrigger>
                <TabsTrigger value="done">Terminés {done}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {visible.length === 0 ? (
                  <p className="text-muted-foreground p-6 text-center text-sm">Aucun projet ne correspond.</p>
              ) : (
                batches.map((b) => (
                  <div key={b} className="flex flex-col gap-0.5">
                    {batches.length > 1 && (
                      <p className="text-muted-foreground px-2 pt-2 pb-1 text-[0.7rem] font-medium tracking-wide uppercase">
                        Batch {b}
                      </p>
                    )}
                    {visible
                      .filter((i) => i.batch === b)
                      .map((i) => {
                        const selected = i.projectId === current?.projectId;
                        const inProgress = drafts[i.projectId] !== undefined;
                        return (
                          <button
                            key={i.projectId}
                            type="button"
                            onClick={() => select(i.projectId)}
                            aria-current={selected ? "true" : undefined}
                            className={cn(
                              "focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-2",
                              selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                            )}
                          >
                            {i.scored ? (
                              <CheckCircle2
                                className="text-success size-4 shrink-0"
                        aria-label="Évalué"
                              />
                            ) : inProgress ? (
                              <CircleDot
                                className="text-primary size-4 shrink-0"
                                aria-label="In progress"
                              />
                            ) : (
                              <Circle
                                className="text-muted-foreground/60 size-4 shrink-0"
                        aria-label="À faire"
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{i.title}</span>
                              <span className="text-muted-foreground block truncate text-xs">
                                {i.trackName ?? "No track"}
                              </span>
                            </span>
                            {i.scored && i.criteria && (
                              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                                {i.favorite && <Heart className="text-primary mr-1 inline size-3" />}
                                {formatNumber(rawScore(i.criteria, criteria, Boolean(i.favorite)), 2)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Selected project */}
          {current && (
            <div ref={detailRef} className="flex scroll-mt-20 flex-col gap-6">
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {current.trackName && <Badge variant="secondary">{current.trackName}</Badge>}
                      {current.scored && (
                        <Badge variant="outline">
                      <CheckCircle2 /> Évalué {relativeTime(current.scoredAt)}
                        </Badge>
                      )}
                      {current.favorite && (
                        <Badge>
                          <Heart /> Coup de cœur
                        </Badge>
                      )}
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-balance">
                      {current.title}
                    </h2>
                    {current.tagline && (
                      <p className="text-muted-foreground text-pretty">{current.tagline}</p>
                    )}
                  </div>
                  {(current.repoUrl || current.liveUrl || current.videoUrl) && (
                    <div className="flex flex-wrap gap-2">
                      {current.repoUrl && (
                        <ExtLink href={current.repoUrl} icon={FolderGit2} label="Repository" />
                      )}
                      {current.liveUrl && (
                        <ExtLink href={current.liveUrl} icon={Globe} label="Live demo" />
                      )}
                      {current.videoUrl && (
                        <ExtLink href={current.videoUrl} icon={Video} label="Video" />
                      )}
                    </div>
                  )}
                  {current.techTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {current.techTags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <RichContent
                    doc={current.content}
                    className="max-h-[28rem] overflow-y-auto"
                    empty={
                      <p className="text-muted-foreground text-sm">
                        {current.description || "No write-up provided."}
                      </p>
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Rubric</h3>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                        <Kbd>1</Kbd>–<Kbd>5</Kbd> to mark · <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd> to move · <Kbd>⌘</Kbd>
                    <Kbd>↵</Kbd> enregistrer et continuer
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground text-xs">
                {draft.favorite ? "Note pondérée avec bonus +1" : "Note pondérée"}
                      </p>
                      <p className="text-2xl font-semibold tabular-nums">
                        {Object.keys(draft.marks).length ? formatNumber(preview, 2) : "—"}
                        <span className="text-muted-foreground text-sm font-normal">
                  {draft.favorite ? " / 5 + bonus" : " / 5"}
                        </span>
                      </p>
                    </div>
                  </div>

                  {criteria.length === 0 ? (
                    <Alert>
                      <AlertTitle>No rubric yet</AlertTitle>
                      <AlertDescription>
                      Les administrateurs n’ont pas encore défini les critères de cet événement.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {criteria.map((c, idx) => {
                        const value = draft.marks[c.key];
                        return (
                          <div
                            key={c.id}
                            className={cn(
                              "flex flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                              idx === active && !locked
                                ? "border-primary/50 bg-primary/5"
                                : "border-border"
                            )}
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-sm font-medium">
                                {c.label}
                                <Badge variant="secondary" className="tabular-nums">
                                  {Math.round((c.weight / totalWeight) * 100)}%
                                </Badge>
                              </p>
                              {c.description && (
                                <p className="text-muted-foreground text-xs">{c.description}</p>
                              )}
                            </div>
                            <ToggleGroup
                          aria-label={`Note pour ${c.label}`}
                              value={value ? [String(value)] : []}
                              onValueChange={(v) => {
                                setActive(idx);
                                if (v[0]) mark(c.key, Number(v[0]));
                              }}
                              onFocusCapture={() => setActive(idx)}
                              disabled={locked}
                              spacing={1}
                              className="w-full shrink-0 sm:w-auto"
                            >
                              {SCALE.map((s) => (
                                <ToggleGroupItem
                                  key={s.value}
                                  value={String(s.value)}
                                  variant="outline"
                                  aria-label={`${s.value} — ${s.label}`}
                                  className="data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:border-primary h-12 flex-1 flex-col gap-0 px-2 sm:w-16 sm:flex-none"
                                >
                                  <span className="text-base leading-none font-semibold tabular-nums">
                                    {s.value}
                                  </span>
                                  <span className="text-[0.65rem] leading-tight font-normal opacity-80">
                                    {s.label}
                                  </span>
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <Field orientation="horizontal" data-disabled={locked || undefined}>
                    <Checkbox
                      id="judge-favorite"
                      checked={draft.favorite}
                      disabled={locked}
                      onCheckedChange={(checked) => update({ favorite: checked === true })}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="judge-favorite">
                        <Heart /> Coup de cœur (+1)
                      </FieldLabel>
                      <FieldDescription>
                        Un seul par événement. Enregistrer ce projet déplace votre bonus depuis le
                        projet précédemment choisi.
                      </FieldDescription>
                    </FieldContent>
                  </Field>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="judge-comment" className="text-sm font-medium">
                      Notes <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <Textarea
                      id="judge-comment"
                      value={draft.comment}
                      onChange={(e) => update({ comment: e.target.value })}
                      placeholder="Points marquants ? Visible uniquement par vous et les administrateurs."
                      maxLength={4000}
                      rows={3}
                      disabled={locked}
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="size-3.5 shrink-0" />
                    Vos notes sont privées : les autres coachs ne peuvent pas les voir.
                    </p>
                    {!locked && (
                      <Button
                        onClick={submit}
                        disabled={!complete || save.isPending}
                        className="shrink-0"
                      >
                        {save.isPending ? <Spinner /> : null}
                      {current.scored && !dirty ? "Mettre à jour et continuer" : "Enregistrer et continuer"}
                        <ArrowRight />
                      </Button>
                    )}
                  </div>
                  {!locked && !complete && criteria.length > 0 && (
                    <p className="text-muted-foreground -mt-3 text-right text-xs">
                      {criteria.filter((c) => draft.marks[c.key] === undefined).length} critère(s)
                      left to mark
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExtLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noreferrer" />}
    >
      <Icon /> {label} <ExternalLink className="text-muted-foreground" />
    </Button>
  );
}
