"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  Compass,
  FolderKanban,
  PencilLine,
  UsersRound,
} from "lucide-react";

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
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { cn } from "@juryza/ui/lib/utils";

import { coverStyle } from "@/components/event-bits";
import { PageHeader, Section } from "@/components/page";
import { api } from "@/lib/api";
import { formatDateTime, hueOf, relativeTime } from "@/lib/format";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import type { overviewFor } from "@/lib/server/people";
import type { Json } from "@/lib/types";

/**
 * My projects: every project the viewer works on, across events, with its
 * status and the time left to edit. In Innovation Lab, projects are created
 * automatically from the selected pitches.
 */

type Overview = Json<Awaited<ReturnType<typeof overviewFor>>>;

export default function ProjectsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["me", "overview"],
    queryFn: () => api.get<Overview>("/api/me/overview"),
  });

  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Mes projets"
        description="Les pitchs retenus deviennent automatiquement des projets. Retrouvez ici ceux auxquels vous participez."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
            <Compass /> Voir les événements
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Impossible de charger vos projets</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : data?.projects.length ? (
        <Section
          title="Vos projets"
          description={`${data.projects.length} projet${data.projects.length > 1 ? "s" : ""}`}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.projects.map((p) => {
              const closes = new Date(p.submissionsClose).getTime();
              const open = closes > now;
              const soon = open && closes - now < 48 * 3600_000;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="group focus-visible:outline-none"
                >
                  <Card className="group-focus-visible:ring-ring/50 h-full gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md group-focus-visible:ring-3">
                    <div
                      className="relative h-24"
                      style={p.thumbnailUrl ? undefined : coverStyle(hueOf(p.id))}
                    >
                      {p.thumbnailUrl && (
                        // biome-ignore lint/performance/noImgElement: arbitrary user-supplied URL
                        <img
                          src={p.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover"
                        />
                      )}
                      <Badge
                        variant={p.status === "submitted" ? "default" : "secondary"}
                        className="absolute top-3 left-3 capitalize shadow-sm"
                      >
                        {p.status}
                      </Badge>
                    </div>
                    <CardContent className="flex flex-1 flex-col gap-3 p-4">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{p.title}</h3>
                        <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
                          {p.tagline || "Aucun résumé pour le moment"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="max-w-full truncate">
                          {p.eventName}
                        </Badge>
                        {EVENT_TRACKS_ENABLED && p.trackName && (
                          <Badge variant="outline">{p.trackName}</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs">
                        <span className="flex items-center gap-1.5 truncate">
                          <UsersRound className="size-3.5 shrink-0" />
                          {p.teamName} · modifié {relativeTime(p.updatedAt, now)}
                        </span>
                        {open ? (
                          <span
                            title={formatDateTime(closes)}
                            className={cn(
                              "flex shrink-0 items-center gap-1",
                              soon && "text-destructive font-medium"
                            )}
                          >
                            <CalendarClock className="size-3.5" />
                            {relativeTime(closes, now)}
                          </span>
                        ) : (
                          <span className="shrink-0">Terminé</span>
                        )}
                      </div>
                      {p.status === "draft" && open && (
                        <p className="bg-muted text-muted-foreground -mx-1 rounded-md px-2 py-1.5 text-xs">
                          Brouillon — à finaliser avant le {formatDateTime(closes)} pour permettre
                          l’évaluation par les coachs.
                        </p>
                      )}
                      <span className="text-primary flex items-center gap-1 text-sm font-medium">
                        <PencilLine className="size-3.5" />{" "}
                        {open ? "Ouvrir l’éditeur" : "Voir le projet"}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanban />
            </EmptyMedia>
            <EmptyTitle>Aucun projet pour le moment</EmptyTitle>
            <EmptyDescription>
              Après l’évaluation des pitchs, les pitchs retenus deviennent automatiquement des
              projets que les participants peuvent rejoindre.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/events" />}>
              <Compass /> Voir les événements
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </>
  );
}
