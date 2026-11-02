"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Compass,
  Flame,
  FolderKanban,
  MapPin,
  Pin,
  Search,
  UsersRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent } from "@juryza/ui/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@juryza/ui/components/ui/input-group";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@juryza/ui/components/ui/tabs";

import { EventCover, NextMilestone, PhaseBadge } from "@/components/event-bits";
import { useI18n } from "@/components/locale-provider";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { formatNumber, formatRange } from "@/lib/format";
import { type Phase, phaseOf } from "@/lib/phase";
import { hasAtLeast } from "@/lib/roles";
import type { Event, Json } from "@/lib/types";

/** Search and filter the published internal Innovation Lab events. */

type EventRow = Json<Event> & { projectCount: number; participantCount: number };

export default function EventsPage() {
  const viewer = useViewer();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<"all" | "fixtures" | Phase>("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<{ events: EventRow[] }>("/api/events"),
  });
  const filters: { value: "all" | "fixtures" | Phase; label: string }[] = [
    { value: "all", label: t("events.all") },
    { value: "fixtures", label: t("events.demos") },
    { value: "pitching", label: t("events.pitching") },
    { value: "pitch-voting", label: t("events.voting") },
    { value: "team-formation", label: t("events.formation") },
    { value: "submissions", label: t("events.projects") },
    { value: "judging", label: t("events.evaluation") },
    { value: "results", label: t("events.results") },
    { value: "upcoming", label: t("events.upcoming") },
  ];

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: data?.events.length ?? 0,
      fixtures: (data?.events ?? []).filter((e) => e.isFixture).length,
    };
    for (const e of data?.events ?? []) {
      const p = phaseOf(e);
      c[p] = (c[p] ?? 0) + 1;
    }
    return c;
  }, [data]);

  const filteredEvents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.events ?? []).filter((e) => {
      if (phase === "fixtures" && !e.isFixture) return false;
      if (phase !== "all" && phase !== "fixtures" && phaseOf(e) !== phase) return false;
      if (
        needle &&
        ![e.name, e.tagline, e.description, e.location].some((s) =>
          s?.toLowerCase().includes(needle)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [data, q, phase]);

  const pinnedFixtures = useMemo(() => (data?.events ?? []).filter((e) => e.isFixture), [data]);

  return (
    <div className="flex flex-col">
      <section className="bg-muted/30 border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-14 pb-8 sm:px-6 sm:pt-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-primary text-sm font-semibold">{t("events.eyebrow")}</span>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-muted-foreground text-xs font-medium">
                  {data?.events.length ?? 0} {t("site.events").toLowerCase()}
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("events.title")}
              </h1>
              <p className="text-muted-foreground max-w-2xl text-base">
                {t("events.description")}
              </p>
            </div>
            {hasAtLeast(viewer?.role, "judge") && (
              <Button nativeButton={false} render={<Link href="/manage/new" />}>
                <CalendarPlus /> {t("events.new")}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <InputGroup className="bg-background h-9 lg:max-w-sm">
              <InputGroupAddon>
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("events.search")}
                aria-label={t("events.search")}
              />
            </InputGroup>
            <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Tabs value={phase} onValueChange={(v) => setPhase(v as "all" | "fixtures" | Phase)}>
                <TabsList className="h-9 w-max flex-nowrap">
                  {filters.map((f) => (
                    <TabsTrigger key={f.value} value={f.value} className="px-2.5">
                      {f.label}
                      {data && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {counts[f.value] ?? 0}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("events.loadError")}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* PINNED EVALUATION FIXTURES SECTION (When on "All" view with no search query) */}
            {phase === "all" && !q.trim() && pinnedFixtures.length > 0 && (
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 grid size-6 place-items-center rounded-md">
                      <Pin className="size-3.5 rotate-45" />
                    </span>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {t("events.demoSection")}
                    </h2>
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 text-amber-600 text-xs dark:text-amber-400"
                    >
                      {t("events.demo")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs sm:text-sm">
                    {t("events.demoHint")}
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {pinnedFixtures.map((e) => (
                    <PinnedEventCard key={e.id} e={e} />
                  ))}
                </div>
              </section>
            )}

            {/* MAIN / FILTERED EVENTS LIST */}
            <section className="flex flex-col gap-4">
              {phase === "all" && !q.trim() && (
                <div className="flex items-center justify-between border-t pt-8">
                  <div className="flex items-center gap-2">
                    <Flame className="text-primary size-5" />
                    <h2 className="text-xl font-semibold tracking-tight">
                      {t("events.list")}
                    </h2>
                    <Badge variant="secondary" className="text-xs">
                      Innovation Lab
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {filteredEvents.filter((e) => !e.isFixture).length} {t("site.events").toLowerCase()}
                  </span>
                </div>
              )}

              {filteredEvents.length === 0 ? (
                <Empty className="border py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Compass />
                    </EmptyMedia>
                    <EmptyTitle>
                      {data?.events.length ? t("events.noMatch") : t("events.none")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {data?.events.length
                        ? t("events.tryFilters")
                        : t("events.waiting")}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    {data?.events.length ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQ("");
                          setPhase("all");
                        }}
                      >
                        {t("events.clear")}
                      </Button>
                    ) : (
                      <Button nativeButton={false} render={<Link href="/manage/new" />}>
                        <CalendarPlus /> {t("home.createEvent")}
                      </Button>
                    )}
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {/* If in "All" view with no search, show non-fixtures here since pinned ones are at top */}
                  {(phase === "all" && !q.trim()
                    ? filteredEvents.filter((e) => !e.isFixture)
                    : filteredEvents
                  ).map((e) => (
                    <EventCard key={e.id} e={e} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** Featured Pinned Fixture Card for Evaluators */
function PinnedEventCard({ e }: { e: EventRow }) {
  const isDogfoodFixture = e.slug === "sample-hack-2026";
  const { t } = useI18n();
  return (
    <Link
      href={`/e/${e.slug}`}
      className="group focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3"
    >
      <Card className="border-primary/30 relative h-full gap-0 overflow-hidden py-0 shadow-sm transition-all group-hover:-translate-y-1 group-hover:border-primary group-hover:shadow-md">
        <EventCover hue={e.hue} className="flex h-32 items-start justify-between gap-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="bg-amber-500 text-slate-950 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm">
              <Pin className="size-3" />
              {isDogfoodFixture ? "DOGFOOD 2026" : t("events.demo")}
            </span>
            <PhaseBadge event={e} className="bg-black/40 text-white backdrop-blur" />
          </div>
          <span className="rounded bg-black/40 px-2 py-0.5 text-[0.7rem] font-medium text-white backdrop-blur">
            {t("events.demo")}
          </span>
        </EventCover>
        <CardContent className="flex flex-1 flex-col gap-3.5 p-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold tracking-tight">{e.name}</h3>
              <CheckCircle2 className="text-primary size-4 shrink-0" />
            </div>
            {e.tagline && <p className="text-muted-foreground line-clamp-2 text-sm">{e.tagline}</p>}
          </div>

          <div className="text-muted-foreground flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" />
              {formatRange(e.submissionsOpen, e.submissionsClose)}
            </span>
            <span className="flex items-center gap-1.5 capitalize">
              <MapPin className="size-3.5 shrink-0" />
              <span>{e.location ? `${e.mode} · ${e.location}` : e.mode}</span>
            </span>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3.5 text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1" title="Participants">
                <UsersRound className="text-muted-foreground size-3.5" />
                <span className="font-semibold tabular-nums">
                  {formatNumber(e.participantCount)}
                </span>
              </span>
              <span className="flex items-center gap-1" title="Submitted projects">
                <FolderKanban className="text-muted-foreground size-3.5" />
                <span className="font-semibold tabular-nums">{formatNumber(e.projectCount)}</span>
              </span>
            </div>
            <span className="text-primary font-medium group-hover:underline">
              {t("events.open")} &rarr;
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Standard Event Card */
function EventCard({ e }: { e: EventRow }) {
  const { t } = useI18n();
  return (
    <Link
      href={`/e/${e.slug}`}
      className="group focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3"
    >
      <Card className="h-full gap-0 overflow-hidden py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg">
        <EventCover hue={e.hue} className="flex h-28 items-start justify-between gap-2 p-3">
          <PhaseBadge event={e} className="bg-white/15 text-white backdrop-blur" />
          {e.isFixture ? (
            <Badge className="bg-amber-500 font-semibold text-white shadow-sm">
              <Pin className="size-3" /> {t("events.demo")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-black/30 text-white backdrop-blur">
              Innovation Lab
            </Badge>
          )}
        </EventCover>
        <CardContent className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold tracking-tight">{e.name}</h3>
            {e.tagline && <p className="text-muted-foreground line-clamp-2 text-sm">{e.tagline}</p>}
          </div>
          <div className="text-muted-foreground flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" />
              {formatRange(e.submissionsOpen, e.submissionsClose)}
            </span>
            <span className="flex items-center gap-2 capitalize">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{e.location ? `${e.mode} · ${e.location}` : e.mode}</span>
            </span>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4 text-sm">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5" title="Participants">
                <UsersRound className="text-muted-foreground size-4" />
                <span className="font-medium tabular-nums">{formatNumber(e.participantCount)}</span>
              </span>
              <span className="flex items-center gap-1.5" title="Submitted projects">
                <FolderKanban className="text-muted-foreground size-4" />
                <span className="font-medium tabular-nums">{formatNumber(e.projectCount)}</span>
              </span>
            </div>
            <NextMilestone event={e} className="truncate text-xs" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
