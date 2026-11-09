"use client";

/**
 * /manage — "My events": every event the viewer organizes (admins see every
 * event on the platform), with lifecycle, counts, the next milestone and quick
 * links into each event's console.
 */

import { useState } from "react";
import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarPlus,
  ExternalLink,
  FolderKanban,
  Gauge,
  LayoutGrid,
  List,
  Search,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent, CardFooter } from "@juryza/ui/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@juryza/ui/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@juryza/ui/components/ui/toggle-group";

import { EventCover, NextMilestone, PhaseBadge } from "@/components/event-bits";
import { PageHeader, StatCard } from "@/components/page";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { formatNumber, formatRange } from "@/lib/format";
import { phaseOf } from "@/lib/phase";
import { hasAtLeast } from "@/lib/roles";
import type { overviewFor } from "@/lib/server/people";
import type { Event, Json } from "@/lib/types";

type Overview = Json<Awaited<ReturnType<typeof overviewFor>>>;
type AllEvents = { events: (Json<Event> & { projectCount: number; participantCount: number })[] };

interface Row {
  id: string;
  slug: string;
  name: string;
  hue: number;
  visibility: string;
  submissionsOpen: string | null;
  submissionsClose: string;
  judgingClose: string | null;
  votingOpen: string | null;
  votingClose: string | null;
  resultsPublished: boolean;
  projects: number;
  participants: number;
}

function useManagedEvents(admin: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ["manage", "events", admin],
    enabled,
    queryFn: async (): Promise<Row[]> => {
      if (admin) {
        const { events } = await api.get<AllEvents>("/api/events");
        return events.map((e) => ({
          ...e,
          projects: e.projectCount,
          participants: e.participantCount,
        }));
      }
      const o = await api.get<Overview>("/api/me/overview");
      return o.organizing;
    },
  });
}

export default function ManageEventsPage() {
  const viewer = useViewer();
  const coach = hasAtLeast(viewer?.role, "judge");
  const admin = viewer?.role === "admin";
  const { data, isLoading, error } = useManagedEvents(admin, coach);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  if (!coach) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert />
          </EmptyMedia>
          <EmptyTitle>Rôle de coach nécessaire</EmptyTitle>
          <EmptyDescription>
            Seuls les coachs peuvent créer et conduire des événements. Un administrateur peut
            attribuer ce rôle à votre compte.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
            Voir les événements
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const rows = (data ?? []).filter((e) =>
    e.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const live = (data ?? []).filter(
    (e) => e.visibility === "published" && phaseOf(e) !== "results"
  ).length;
  const totalProjects = (data ?? []).reduce((n, e) => n + e.projects, 0);
  const totalPeople = (data ?? []).reduce((n, e) => n + e.participants, 0);

  return (
    <>
      <PageHeader
        eyebrow="Organiser"
        title="Mes événements"
        description={
          admin
            ? "Tous les événements Innovation Lab de cette instance."
            : "Les événements que vous accompagnez comme coach."
        }
        actions={
          <Button nativeButton={false} render={<Link href="/manage/new" />}>
            <CalendarPlus /> Nouvel événement
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Événements"
          value={isLoading ? "…" : formatNumber(data?.length ?? 0)}
          icon={Gauge}
        />
        <StatCard
          label="En cours"
          value={isLoading ? "…" : formatNumber(live)}
          hint="Publiés, résultats en attente"
          icon={ArrowRight}
        />
        <StatCard
          label="Projets"
          value={isLoading ? "…" : formatNumber(totalProjects)}
          icon={FolderKanban}
        />
        <StatCard
          label="Participants"
          value={isLoading ? "…" : formatNumber(totalPeople)}
          icon={UsersRound}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les événements</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarPlus />
            </EmptyMedia>
            <EmptyTitle>Aucun événement</EmptyTitle>
            <EmptyDescription>
              Préparez votre premier Innovation Lab : informations, calendrier et règles du
              parcours. Il restera en brouillon jusqu’à sa publication.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/manage/new" />}>
              <CalendarPlus /> Créer un événement
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <InputGroup className="max-w-xs">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer les événements…"
                aria-label="Filtrer les événements"
              />
            </InputGroup>
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[view]}
              onValueChange={(v) => v[0] && setView(v[0] as "grid" | "list")}
            >
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <LayoutGrid />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <List />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucun événement ne correspond à « {query} ».
            </p>
          ) : view === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((e) => (
                <Card key={e.id} className="gap-0 overflow-hidden py-0">
                  <Link href={`/manage/${e.slug}`} aria-label={`Open ${e.name} console`}>
                    <EventCover hue={e.hue} className="h-24">
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        <Badge variant={e.visibility === "draft" ? "secondary" : "default"}>
                          {e.visibility === "draft" ? "Brouillon" : "Publié"}
                        </Badge>
                      </div>
                    </EventCover>
                  </Link>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/manage/${e.slug}`}
                          className="block truncate font-semibold hover:underline"
                        >
                          {e.name}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {formatRange(e.submissionsOpen, e.submissionsClose)}
                        </p>
                      </div>
                      <PhaseBadge event={e} />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <dt className="text-muted-foreground text-xs">Projets</dt>
                        <dd className="font-semibold tabular-nums">{formatNumber(e.projects)}</dd>
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <dt className="text-muted-foreground text-xs">Participants</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatNumber(e.participants)}
                        </dd>
                      </div>
                    </dl>
                    <NextMilestone event={e} className="text-xs" />
                  </CardContent>
                  <CardFooter className="gap-2 border-t p-3">
                    <Button
                      size="sm"
                      className="flex-1"
                      nativeButton={false}
                      render={<Link href={`/manage/${e.slug}`} />}
                    >
                      <Gauge /> Gérer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      nativeButton={false}
                      render={<Link href={`/e/${e.slug}`} target="_blank" />}
                    >
                      <ExternalLink /> Page de l’événement
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Événement</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Projets</TableHead>
                      <TableHead className="text-right">Participants</TableHead>
                      <TableHead>Prochaine étape</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Link href={`/manage/${e.slug}`} className="flex items-center gap-3">
                            <EventCover hue={e.hue} className="size-8 shrink-0 rounded-md" />
                            <span className="font-medium hover:underline">{e.name}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            {e.visibility === "draft" && <Badge variant="outline">Brouillon</Badge>}
                            <PhaseBadge event={e} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(e.projects)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(e.participants)}
                        </TableCell>
                        <TableCell>
                          <NextMilestone event={e} className="text-xs" />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              nativeButton={false}
                              render={<Link href={`/manage/${e.slug}`} />}
                            >
                              Gérer
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Page de l’événement"
                              nativeButton={false}
                              render={<Link href={`/e/${e.slug}`} target="_blank" />}
                            >
                              <ExternalLink />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
