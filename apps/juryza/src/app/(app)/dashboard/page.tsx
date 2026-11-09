"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Award,
  CalendarPlus,
  CheckCircle2,
  Compass,
  FolderKanban,
  Gavel,
  Settings2,
} from "lucide-react";

import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent } from "@juryza/ui/components/ui/card";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";

import { NextMilestone, PhaseBadge } from "@/components/event-bits";
import { PageHeader, Section } from "@/components/page";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { hasAtLeast } from "@/lib/roles";
import type { overviewFor } from "@/lib/server/people";
import type { Json } from "@/lib/types";

type Overview = Json<Awaited<ReturnType<typeof overviewFor>>>;

type DashboardLink = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

export default function DashboardPage() {
  const viewer = useViewer();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "overview"],
    queryFn: () => api.get<Overview>("/api/me/overview"),
  });
  const canManageEvents = hasAtLeast(viewer?.role, "judge");
  const now = Date.now();
  const firstName = viewer?.name.split(" ")[0] ?? "vous";

  const judgingActions: DashboardLink[] =
    data?.judging.flatMap((event) => {
      const opens = event.judgingOpen
        ? new Date(event.judgingOpen).getTime()
        : new Date(event.submissionsClose).getTime();
      const closes = event.judgingClose ? new Date(event.judgingClose).getTime() : null;
      const isClosed = Boolean(event.resultsPublished) || (closes !== null && closes <= now);
      const remaining = Math.max(0, event.assigned - event.scored);

      if (isClosed || opens > now || remaining === 0) return [];

      return [
        {
          key: `judging-${event.id}`,
          eyebrow: "Délibération",
          title: `Évaluer ${event.name}`,
          description: `${remaining} projet${remaining > 1 ? "s" : ""} reste${
            remaining > 1 ? "nt" : ""
          } à noter collectivement.`,
          href: `/judging/${event.slug}`,
          label: "Continuer",
          icon: Gavel,
        },
      ];
    }) ?? [];

  const projectActions: DashboardLink[] =
    data?.projects
      .filter(
        (project) =>
          project.status !== "submitted" && new Date(project.submissionsClose).getTime() > now
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

  const eventActions: DashboardLink[] = data?.participating[0]
    ? [
        {
          key: `event-${data.participating[0].id}`,
          eyebrow: "Prochaine étape",
          title: data.participating[0].name,
          description: data.participating[0].teamName
            ? `Retrouvez votre projet ${data.participating[0].teamName} et la suite du programme.`
            : "Rejoignez un projet pour poursuivre votre parcours.",
          href: `/e/${data.participating[0].slug}`,
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
    ...(data?.participating[0]
      ? [
          {
            key: "current-event",
            eyebrow: "Événement",
            title: data.participating[0].name,
            description: data.participating[0].teamName
              ? `Projet ${data.participating[0].teamName}`
              : "Aucun projet rejoint",
            href: `/e/${data.participating[0].slug}`,
            label: "Ouvrir",
            icon: Compass,
          },
        ]
      : []),
    ...(data?.projects[0]
      ? [
          {
            key: "current-project",
            eyebrow: "Projet",
            title: data.projects[0].title,
            description: data.projects[0].eventName,
            href: `/projects/${data.projects[0].id}`,
            label: "Ouvrir",
            icon: FolderKanban,
          },
        ]
      : []),
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
                            {shortcut.key === "current-event" && data?.participating[0] ? (
                              <PhaseBadge event={data.participating[0]} />
                            ) : (
                              <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold">{shortcut.title}</p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {shortcut.description}
                            </p>
                          </div>
                          {shortcut.key === "current-event" && data?.participating[0] && (
                            <NextMilestone
                              event={data.participating[0]}
                              className="mt-auto text-xs"
                            />
                          )}
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
