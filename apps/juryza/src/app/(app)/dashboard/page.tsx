"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  CalendarPlus,
  CheckCircle2,
  Compass,
  FolderKanban,
  Gavel,
  Lock,
  PencilLine,
  UsersRound,
} from "lucide-react";

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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Progress } from "@juryza/ui/components/ui/progress";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";

import { EventCover, NextMilestone, PhaseBadge } from "@/components/event-bits";
import { PageHeader, Section, StatCard } from "@/components/page";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { hasAtLeast } from "@/lib/roles";
import type { overviewFor } from "@/lib/server/people";
import type { Json } from "@/lib/types";

type Overview = Json<Awaited<ReturnType<typeof overviewFor>>>;

export default function DashboardPage() {
  const viewer = useViewer();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "overview"],
    queryFn: () => api.get<Overview>("/api/me/overview"),
  });
  const canCreateEvents = hasAtLeast(viewer?.role, "judge");
  const now = Date.now();
  const toReview =
    data?.judging.reduce((n, j) => {
      const opens = j.judgingOpen
        ? new Date(j.judgingOpen).getTime()
        : new Date(j.submissionsClose).getTime();
      const closes = j.judgingClose ? new Date(j.judgingClose).getTime() : null;
      const locked = Boolean(j.resultsPublished) || (closes !== null && closes <= now);
      if (locked || opens > now) return n;
      return n + Math.max(0, j.assigned - j.scored);
    }, 0) ?? 0;
  const firstName = viewer?.name.split(" ")[0] ?? "vous";

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("fr-FR", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
        title={`Bonjour ${firstName}`}
        description="Vos événements Innovation Lab, projets et évaluations au même endroit."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
              <Compass /> Voir les événements
            </Button>
            {canCreateEvents && (
              <Button nativeButton={false} render={<Link href="/manage/new" />}>
                <CalendarPlus /> Nouvel événement
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Événements rejoints"
          value={isLoading ? "…" : (data?.participating.length ?? 0)}
          icon={Compass}
        />
        <StatCard
          label="Projects"
          value={isLoading ? "…" : (data?.projects.length ?? 0)}
          icon={FolderKanban}
        />
        <StatCard
          label="Évaluations à faire"
          value={isLoading ? "…" : toReview}
          icon={Gavel}
          hint={data?.judging.length ? `sur ${data.judging.length} événement(s)` : undefined}
        />
        <StatCard
          label="Certificats"
          value={isLoading ? "…" : (data?.certificates.length ?? 0)}
          icon={Award}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-8">
            {data && data.judging.length > 0 && (
              <Section
                title="Évaluations"
                description="Tous les projets à évaluer en tant que coach."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {data.judging.map((j) => {
                    const done = Math.min(j.scored, j.assigned);
                    const pct = j.assigned ? Math.round((done / j.assigned) * 100) : 0;
                    const opens = j.judgingOpen
                      ? new Date(j.judgingOpen).getTime()
                      : new Date(j.submissionsClose).getTime();
                    const closes = j.judgingClose ? new Date(j.judgingClose).getTime() : null;
                    const locked =
                      Boolean(j.resultsPublished) || (closes !== null && closes <= now);
                    const upcoming = !locked && opens > now;
                    const complete = j.assigned > 0 && done >= j.assigned;
                    return (
                      <Card key={j.id} className="gap-3">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base">{j.name}</CardTitle>
                            {locked ? (
                              <Badge variant="secondary" className="gap-1 shrink-0">
                                <Lock className="size-3" />
                                {j.resultsPublished ? "Résultats publiés" : "Évaluations closes"}
                              </Badge>
                            ) : upcoming ? (
                              <Badge variant="outline" className="gap-1 shrink-0">
                                Ouverture {relativeTime(opens, now)}
                              </Badge>
                            ) : complete ? (
                              <Badge className="gap-1 shrink-0">
                                <CheckCircle2 className="size-3" /> Tout est évalué
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription>
                            {j.scored} sur {j.assigned} évalués
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          <Progress value={pct} />
                          <Button
                            size="sm"
                            className="self-start"
                            nativeButton={false}
                            render={<Link href={`/judging/${j.slug}`} />}
                          >
                            {j.assigned === 0
                              ? "Ouvrir l’évaluation"
                              : complete || locked || upcoming
                                ? "Consulter les notes"
                                : j.scored === 0
                                  ? "Commencer"
                                  : "Continuer"}{" "}
                            <ArrowRight />
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section
              title="Vos événements"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/events" />}
                >
                  Voir tous <ArrowRight />
                </Button>
              }
            >
              {data?.participating.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.participating.map((e) => (
                    <Link key={e.id} href={`/e/${e.slug}`} className="group">
                      <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md">
                        <EventCover hue={e.hue} className="h-20" />
                        <CardContent className="flex flex-col gap-2 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate font-semibold">{e.name}</h3>
                            <PhaseBadge event={e} />
                          </div>
                          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                            <UsersRound className="size-3.5" />
                            {e.teamName ? `Projet ${e.teamName}` : "Aucun projet rejoint"}
                          </p>
                          <NextMilestone event={e} className="text-xs" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Compass />
                    </EmptyMedia>
                    <EmptyTitle>Vous n’avez encore rejoint aucun événement</EmptyTitle>
                    <EmptyDescription>
                      Consultez les événements Innovation Lab ouverts et rejoignez un projet retenu.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button nativeButton={false} render={<Link href="/events" />}>
                      Voir les événements
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </Section>

            {canCreateEvents && (
              <Section
                title="Événements que vous organisez"
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/manage" />}
                  >
                    Tout gérer <ArrowRight />
                  </Button>
                }
              >
                {data?.organizing.length ? (
                  <Card className="py-0">
                    <ul className="divide-y">
                      {data.organizing.map((e) => (
                        <li key={e.id}>
                          <Link
                            href={`/manage/${e.slug}`}
                            className="hover:bg-muted/50 flex items-center gap-4 px-4 py-3"
                          >
                            <EventCover hue={e.hue} className="size-10 shrink-0 rounded-lg" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{e.name}</p>
                              <p className="text-muted-foreground text-xs">
                                {e.projects} projets · {e.participants} participants
                              </p>
                            </div>
                            {e.visibility === "draft" && <Badge variant="outline">Brouillon</Badge>}
                            <PhaseBadge event={e} className="hidden sm:inline-flex" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyTitle>Aucun événement</EmptyTitle>
                      <EmptyDescription>
                        Créez votre premier événement Innovation Lab en quelques minutes.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button nativeButton={false} render={<Link href="/manage/new" />}>
                        <CalendarPlus /> Créer un événement
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </Section>
            )}
          </div>

          <div className="flex flex-col gap-8">
            <Section title="Vos projets">
              {data?.projects.length ? (
                <div className="flex flex-col gap-2">
                  {data.projects.map((p) => (
                    <Card key={p.id} className="gap-2 py-4">
                      <CardContent className="flex items-start justify-between gap-3 px-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.title}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {p.eventName} · modifié {relativeTime(p.updatedAt)}
                          </p>
                        </div>
                        <Badge
                          variant={p.status === "submitted" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {p.status}
                        </Badge>
                      </CardContent>
                      <CardContent className="px-4">
                        <Button
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={<Link href={`/projects/${p.id}`} />}
                        >
                          <PencilLine /> Ouvrir l’éditeur
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Les projets que vous rejoignez apparaîtront ici après la sélection des pitchs.
                </p>
              )}
            </Section>

            {data && data.certificates.length > 0 && (
              <Section title="Certificats">
                <div className="flex flex-col gap-2">
                  {data.certificates.map((c) => (
                    <Link
                      key={c.serial}
                      href={`/certificates/${c.serial}`}
                      className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3"
                    >
                      <Award className="text-primary size-5 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.eventName}</p>
                        <p className="text-muted-foreground truncate text-xs capitalize">
                          {c.kind} · {c.serial}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
