"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Code2,
  Compass,
  ExternalLink,
  FolderKanban,
  Gavel,
  Globe2,
  MapPin,
  MessageCircle,
  Settings2,
} from "lucide-react";

import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";

import { PageHeader, Section } from "@/components/page";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { hasAtLeast } from "@/lib/roles";
import type { currentParticipantContextFor, overviewFor } from "@/lib/server/people";
import type { Json } from "@/lib/types";

type Overview = Json<Awaited<ReturnType<typeof overviewFor>>>;
type CurrentParticipantContext = Json<Awaited<ReturnType<typeof currentParticipantContextFor>>>;

type DashboardLink = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

type ProjectResourceLink = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const calendarDay = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const calendarTime = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

export default function DashboardPage() {
  const viewer = useViewer();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "overview"],
    queryFn: () => api.get<Overview>("/api/me/overview"),
  });
  const { data: participantContext, isLoading: isParticipantContextLoading } = useQuery({
    queryKey: ["me", "current-participant-context"],
    queryFn: () => api.get<CurrentParticipantContext>("/api/me/current-context"),
  });
  const canManageEvents = hasAtLeast(viewer?.role, "judge");
  const now = Date.now();
  const firstName = viewer?.name.split(" ")[0] ?? "vous";
  const currentParticipation = data?.participating.find(
    (event) =>
      event.workflow === "innolab" &&
      Boolean(event.activatedAt) &&
      !event.cancelledAt &&
      !event.archivedAt
  );
  const currentProject = currentParticipation
    ? data?.projects.find((project) => project.eventSlug === currentParticipation.slug)
    : undefined;
  const currentContext =
    participantContext?.event.slug === currentParticipation?.slug ? participantContext : null;
  const upcomingSchedule =
    currentContext?.schedule.filter((item) => new Date(item.endsAt).getTime() >= now).slice(0, 3) ??
    [];
  const projectResources: ProjectResourceLink[] = currentProject
    ? [
        ...(currentProject.repoUrl
          ? [
              {
                key: "project-sources",
                title: "Sources du projet",
                description: "Dépôt de travail de l’équipe",
                href: currentProject.repoUrl,
                icon: Code2,
              },
            ]
          : []),
        ...(currentProject.liveUrl
          ? [
              {
                key: "project-demo",
                title: "Démonstration",
                description: "Version consultable du projet",
                href: currentProject.liveUrl,
                icon: Globe2,
              },
            ]
          : []),
        ...(currentContext?.audit
          ? [
              {
                key: `document-${currentContext.audit.id}`,
                title: currentContext.audit.title,
                description: "Document de référence",
                href: currentContext.audit.url,
                icon: BookOpen,
              },
            ]
          : []),
        ...(currentContext?.resources.flatMap((resource) =>
          resource.url
            ? [
                {
                  key: `resource-${resource.id}`,
                  title: resource.name,
                  description: resource.description ?? "Ressource documentaire",
                  href: resource.url,
                  icon: BookOpen,
                },
              ]
            : []
        ) ?? []),
      ]
        .filter(
          (resource, index, resources) =>
            resources.findIndex((candidate) => candidate.href === resource.href) === index
        )
        .slice(0, 4)
    : [];

  const currentJudging = data?.judging
    .flatMap((event) => {
      const opens = event.judgingOpen
        ? new Date(event.judgingOpen).getTime()
        : new Date(event.submissionsClose).getTime();
      const closes = event.judgingClose ? new Date(event.judgingClose).getTime() : null;
      const isClosed = Boolean(event.resultsPublished) || (closes !== null && closes <= now);
      const remaining = Math.max(0, event.assigned - event.scored);

      const isActive = Boolean(event.activatedAt) && !event.cancelledAt && !event.archivedAt;
      if (!isActive || isClosed || opens > now || remaining === 0) return [];
      return [{ event, remaining, closes: closes ?? Number.MAX_SAFE_INTEGER }];
    })
    .toSorted(
      (left, right) =>
        Number(right.event.workflow === "innolab") - Number(left.event.workflow === "innolab") ||
        left.closes - right.closes
    )[0];

  const judgingActions: DashboardLink[] = currentJudging
    ? [
        {
          key: `judging-${currentJudging.event.id}`,
          eyebrow: "Délibération",
          title: `Évaluer ${currentJudging.event.name}`,
          description: `${currentJudging.remaining} projet${
            currentJudging.remaining > 1 ? "s" : ""
          } reste${currentJudging.remaining > 1 ? "nt" : ""} à noter collectivement.`,
          href: `/judging/${currentJudging.event.slug}`,
          label: "Continuer",
          icon: Gavel,
        },
      ]
    : [];

  const projectActions: DashboardLink[] =
    data?.projects
      .filter(
        (project) =>
          project.eventSlug === currentParticipation?.slug &&
          project.status !== "submitted" &&
          new Date(project.submissionsClose).getTime() > now
      )
      .map((project) => ({
        key: `project-${project.id}`,
        eyebrow: "Projet",
        title: `Finaliser ${project.title}`,
        description: `${project.eventName} · modifié ${relativeTime(project.updatedAt)}`,
        href: `/projects/${project.id}`,
        label: "Ouvrir",
        icon: FolderKanban,
      })) ?? [];

  const eventActions: DashboardLink[] = currentParticipation
    ? [
        {
          key: `event-${currentParticipation.id}`,
          eyebrow: "Prochaine étape",
          title: currentParticipation.name,
          description: currentParticipation.teamName
            ? `Retrouvez votre projet ${currentParticipation.teamName} et la suite du programme.`
            : "Rejoignez un projet pour poursuivre votre parcours.",
          href: `/e/${currentParticipation.slug}`,
          label: "Voir l’étape",
          icon: Compass,
        },
      ]
    : [];

  const setupActions: DashboardLink[] =
    data?.organizing
      .filter((event) => event.visibility === "draft")
      .map((event) => ({
        key: `manage-${event.id}`,
        eyebrow: "Préparation",
        title: `Configurer ${event.name}`,
        description: "L’événement est encore en brouillon.",
        href: `/manage/${event.slug}`,
        label: "Configurer",
        icon: Settings2,
      })) ?? [];

  const priorities = [...judgingActions, ...projectActions, ...eventActions, ...setupActions].slice(
    0,
    3
  );

  const shortcuts: DashboardLink[] = [
    ...(canManageEvents
      ? [
          {
            key: "coach-space",
            eyebrow: "Coach",
            title: "Espace d’organisation",
            description: "Gérer l’événement, les critères et la délibération.",
            href: "/manage",
            label: "Gérer",
            icon: Settings2,
          },
        ]
      : []),
    ...(data?.certificates[0]
      ? [
          {
            key: "certificate",
            eyebrow: "Attestation",
            title: data.certificates[0].eventName,
            description: "Votre certificat est disponible.",
            href: `/certificates/${data.certificates[0].serial}`,
            label: "Consulter",
            icon: Award,
          },
        ]
      : []),
  ].slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("fr-FR", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
        title={`Bonjour ${firstName}`}
        description="Commencez par ce qui demande votre attention."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
            <Compass /> Tous les événements
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-8">
          <Skeleton className="h-56 rounded-xl" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <Section title="À faire maintenant" description="Commencez par la première action.">
            {priorities.length > 0 ? (
              <Card className="overflow-hidden py-0">
                <CardContent className="p-0">
                  <ol className="divide-y">
                    {priorities.map((action, index) => {
                      const Icon = action.icon;
                      return (
                        <li
                          key={action.key}
                          className="grid gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-5"
                        >
                          <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                              {index + 1}. {action.eyebrow}
                            </p>
                            <p className="mt-1 font-semibold">{action.title}</p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {action.description}
                            </p>
                          </div>
                          <Button nativeButton={false} render={<Link href={action.href} />}>
                            {action.label} <ArrowRight />
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">Rien d’urgent pour le moment</p>
                    <p className="text-muted-foreground text-sm">
                      Votre dashboard affichera ici la prochaine action utile.
                    </p>
                  </div>
                  {canManageEvents && (
                    <Button nativeButton={false} render={<Link href="/manage/new" />}>
                      <CalendarPlus /> Créer un événement
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </Section>

          {currentParticipation && (
            <Section
              title="Votre Innovation Lab"
              description="Le calendrier et les liens utiles de votre événement actif."
            >
              <div className={currentProject ? "grid gap-4 lg:grid-cols-2" : undefined}>
                <Card className="h-full gap-0">
                  <CardHeader className="border-b">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarDays className="text-primary size-5" /> Calendrier
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {currentParticipation.name}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/e/${currentParticipation.slug}#calendar`} />}
                      >
                        Voir tout <ArrowRight />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 pt-4">
                    {isParticipantContextLoading ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-14 rounded-lg" />
                        <Skeleton className="h-14 rounded-lg" />
                      </div>
                    ) : upcomingSchedule.length > 0 ? (
                      <ul className="divide-y">
                        {upcomingSchedule.map((item) => (
                          <li
                            key={item.id}
                            className="grid grid-cols-[92px_1fr] gap-3 py-3 first:pt-0 last:pb-0"
                          >
                            <time
                              dateTime={item.startsAt}
                              className="text-muted-foreground text-xs leading-5"
                            >
                              <span className="text-foreground block font-semibold capitalize">
                                {calendarDay.format(new Date(item.startsAt))}
                              </span>
                              {calendarTime.format(new Date(item.startsAt))}
                            </time>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{item.title}</p>
                              {item.location && (
                                <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                                  <MapPin className="size-3" /> {item.location}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Aucun rendez-vous à venir n’est encore publié.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      nativeButton={false}
                      render={<a href={`/api/events/${currentParticipation.slug}/calendar.ics`} />}
                    >
                      <CalendarDays /> Ajouter à mon calendrier
                    </Button>
                  </CardContent>
                </Card>

                {currentProject && (
                  <Card className="h-full gap-0">
                    <CardHeader className="border-b">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <FolderKanban className="text-primary size-5" /> {currentProject.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Sources documentaires et accompagnement
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/projects/${currentProject.id}`} />}
                        >
                          Ouvrir <ArrowRight />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 pt-4">
                      {isParticipantContextLoading ? (
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-14 rounded-lg" />
                          <Skeleton className="h-14 rounded-lg" />
                        </div>
                      ) : projectResources.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                          {projectResources.map((resource) => {
                            const Icon = resource.icon;
                            return (
                              <li key={resource.key}>
                                <a
                                  href={resource.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
                                >
                                  <Icon className="text-primary size-4 shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                      {resource.title}
                                    </span>
                                    <span className="text-muted-foreground block truncate text-xs">
                                      {resource.description}
                                    </span>
                                  </span>
                                  <ExternalLink className="text-muted-foreground size-4 shrink-0" />
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          Aucune source documentaire n’est encore liée à ce projet.
                        </p>
                      )}

                      {currentContext?.assistant && (
                        <Button
                          className="self-start"
                          nativeButton={false}
                          render={
                            <a
                              href={currentContext.assistant.url}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          <MessageCircle /> Ouvrir le chat référent
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </Section>
          )}

          {shortcuts.length > 0 && (
            <Section title="Retrouver rapidement">
              <div className="grid gap-3 md:grid-cols-3">
                {shortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <Link key={shortcut.key} href={shortcut.href} className="group">
                      <Card className="hover:border-primary/40 h-full gap-3 transition-colors">
                        <CardContent className="flex h-full flex-col gap-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                              <Icon className="size-4" /> {shortcut.eyebrow}
                            </div>
                            <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                          </div>
                          <div>
                            <p className="font-semibold">{shortcut.title}</p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {shortcut.description}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      )}
    </>
  );
}
