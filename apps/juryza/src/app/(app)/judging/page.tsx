"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CheckCircle2, Gavel, Lock } from "lucide-react";

import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent } from "@juryza/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Progress } from "@juryza/ui/components/ui/progress";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";

import { EventCover } from "@/components/event-bits";
import { PageHeader, StatCard } from "@/components/page";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";

/**
 * Judging queue: every event whose panel the viewer sits on, with their own
 * review progress and the judging deadline, and a way into the scoring
 * scoring console.
 */

interface QueueEvent {
  id: string;
  slug: string;
  name: string;
  hue: number;
  judgingClose: string | null;
  submissionsClose: string;
  resultsPublished: boolean;
  assigned: number;
  scored: number;
}

export default function JudgingPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["judge", "queue"],
    queryFn: () => api.get<{ events: QueueEvent[] }>("/api/judge/queue"),
  });
  const events = data?.events ?? [];
  const assigned = events.reduce((n, e) => n + e.assigned, 0);
  const scored = events.reduce((n, e) => n + Math.min(e.scored, e.assigned), 0);
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Évaluations des projets"
        description="Tous les coachs évaluent tous les projets. Vos notes restent privées jusqu’à la publication des résultats."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Événements" value={isLoading ? "…" : events.length} icon={Gavel} />
        <StatCard label="À évaluer" value={isLoading ? "…" : assigned} />
        <StatCard label="Évalués" value={isLoading ? "…" : scored} icon={CheckCircle2} />
        <StatCard
          label="Restants"
          value={isLoading ? "…" : assigned - scored}
          hint={assigned ? `${Math.round((scored / assigned) * 100)} % terminé` : undefined}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : error ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Impossible de charger les évaluations</EmptyTitle>
            <EmptyDescription>{error.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : events.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Gavel />
            </EmptyMedia>
            <EmptyTitle>Aucun projet à évaluer</EmptyTitle>
            <EmptyDescription>
              Les projets des événements Innovation Lab apparaîtront ici dès leur phase d’évaluation.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => {
            const done = Math.min(e.scored, e.assigned);
            const pct = e.assigned ? Math.round((done / e.assigned) * 100) : 0;
            const closes = e.judgingClose ? new Date(e.judgingClose).getTime() : null;
            const locked = e.resultsPublished || (closes !== null && closes <= now);
            const complete = e.assigned > 0 && done >= e.assigned;
            return (
              <Card key={e.id} className="flex-col gap-0 overflow-hidden py-0 sm:flex-row">
                <EventCover hue={e.hue} className="h-16 shrink-0 sm:h-auto sm:w-28" />
                <CardContent className="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{e.name}</h3>
                      {locked ? (
                        <Badge variant="secondary">
                          <Lock /> {e.resultsPublished ? "Résultats publiés" : "Évaluations closes"}
                        </Badge>
                      ) : complete ? (
                        <Badge>
                          <CheckCircle2 /> Tout est évalué
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={pct}
                        className="flex-1"
                        aria-label={`${done} sur ${e.assigned} évalués`}
                      />
                      <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                        {done} sur {e.assigned} évalués
                      </span>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <CalendarClock className="size-3.5" />
                      {closes === null
                        ? "Aucune date de clôture définie"
                        : closes > now
                          ? `Clôture ${relativeTime(closes, now)} · ${formatDateTime(closes)}`
                          : `Évaluations closes le ${formatDateTime(closes)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/judging/${e.slug}`} />}
                    >
                      {e.assigned === 0
                        ? "Ouvrir"
                        : complete || locked
                          ? "Consulter les notes"
                          : done === 0
                            ? "Commencer"
                            : "Continuer"}
                      <ArrowRight />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
