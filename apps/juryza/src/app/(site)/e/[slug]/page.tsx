"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileSearch,
  Gavel,
  Layers,
  Lightbulb,
  Link2,
  LogIn,
  Megaphone,
  PencilLine,
  Pin,
  Rocket,
  ScrollText,
  Settings2,
  Share2,
  Sparkles,
  Target,
  Trophy,
  UserPlus,
  UsersRound,
  Vote,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@juryza/ui/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Input } from "@juryza/ui/components/ui/input";
import { Separator } from "@juryza/ui/components/ui/separator";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { cn } from "@juryza/ui/lib/utils";

import { RichContent } from "@/components/editor/rich-content";
import { NextMilestone, Timeline } from "@/components/event-bits";
import { useI18n } from "@/components/locale-provider";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatDate, pluralize, relativeTime } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { eventRegistrationIsOpen } from "@/lib/innolab";
import { hasVoting, phaseOf, submissionsAreOpen } from "@/lib/phase";
import { type EventDashboard, type EventDetail, eventKey, useEventDashboard } from "@/lib/queries";
import { docToText, isEmptyDoc, parseRichDoc } from "@/lib/rich-text";
import {
  SCHEDULE_AUDIENCE_LABELS,
  SCHEDULE_KIND_LABELS,
  type ScheduleAudience,
  type ScheduleKind,
} from "@/lib/schedule";

import { CreateTeamDialog } from "./create-team-dialog";

/**
 * Event overview tab: the organizer's write-up, rules, tracks, prizes, rubric
 * and judging panel, with a sidebar that tells the viewer what to do next.
 * (Hero and tabs come from the /e/[slug] layout.)
 */

export default function EventOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useEventDashboard(slug);
  const { t } = useI18n();

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("event.dashboardUnavailable")}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const { event: e } = data;
  return (
    <div className="flex flex-col gap-8">
      <PhaseFocus slug={slug} data={data} />
      {data.wallOfFame && <WallOfFame slug={slug} wall={data.wallOfFame} />}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          {data.announcements.length > 0 && <Announcements items={data.announcements} />}

          <section className="flex flex-col gap-3">
            <SectionTitle icon={Target}>{t("event.about")}</SectionTitle>
            <RichContent
              doc={e.content}
              empty={
                <p className="text-muted-foreground">{e.description || t("event.noOverview")}</p>
              }
            />
          </section>

          {(data.viewer?.registered || data.viewer?.isJudge || data.viewer?.canManage) && (
            <>
              <EventAssistant slug={slug} data={data} />
              <AuditAndResources slug={slug} data={data} />
            </>
          )}

          {e.workflow === "innolab" && <InnolabJourney slug={slug} data={data} />}

          <EventSchedule slug={slug} data={data} />

          {data.tracks.length > 0 && <Tracks tracks={data.tracks} />}
          {data.prizes.length > 0 && <Prizes data={data} />}
          {data.criteria.length > 0 && <Criteria criteria={data.criteria} />}

          {!isEmptyDoc(e.rules) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="text-muted-foreground size-4" /> {t("event.rules")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RichContent
                  doc={e.rules}
                  empty={<p className="text-muted-foreground">{t("event.noRules")}</p>}
                />
              </CardContent>
            </Card>
          )}

          {data.judges.length > 0 && <Judges judges={data.judges} />}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-32 lg:self-start">
          <Participation slug={slug} data={data} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="text-muted-foreground size-4" /> {t("event.timeline")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pl-6">
              <Timeline event={e} />
            </CardContent>
          </Card>
          <KeyFacts data={data} />
          <ShareCard name={e.name} />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main column                                                        */
/* ------------------------------------------------------------------ */

function WallOfFame({
  slug,
  wall,
}: {
  slug: string;
  wall: NonNullable<EventDashboard["wallOfFame"]>;
}) {
  return (
    <section aria-labelledby="wall-of-fame-title">
      <Card className="border-primary/25 bg-primary/5 overflow-hidden">
        <CardContent className="grid gap-6 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <span className="bg-primary text-primary-foreground grid size-12 shrink-0 place-items-center rounded-xl">
              <Trophy className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Wall of Fame</Badge>
                <span className="text-muted-foreground text-sm">Projet classé premier</span>
              </div>
              <div>
                <h2 id="wall-of-fame-title" className="text-xl font-semibold tracking-tight">
                  {wall.project.title}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {wall.project.teamName ?? "Équipe gagnante"}
                  {wall.project.tagline ? ` — ${wall.project.tagline}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                nativeButton={false}
                render={<Link href={`/e/${slug}/projects/${wall.project.id}`} />}
              >
                Voir le projet gagnant <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <p className="text-muted-foreground text-xs font-medium">L’équipe à l’honneur</p>
            <div className="flex flex-wrap gap-3">
              {wall.members.map((member) => {
                const portrait = (
                  <span
                    key={member.id}
                    className="flex w-16 flex-col items-center gap-1.5 text-center"
                  >
                    <UserAvatar
                      name={member.name}
                      image={member.image}
                      className="ring-background size-12 ring-2"
                    />
                    <span className="line-clamp-2 text-xs leading-tight font-medium">
                      {member.name}
                    </span>
                  </span>
                );
                return member.username ? (
                  <Link
                    key={member.id}
                    href={`/u/${member.username}`}
                    className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {portrait}
                  </Link>
                ) : (
                  <span key={member.id}>{portrait}</span>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

const PHASE_FOCUS_KEYS = {
  upcoming: {
    title: "event.phase.upcoming.title",
    description: "event.phase.upcoming.text",
    action: "event.phase.upcoming.action",
  },
  pitching: {
    title: "event.phase.pitching.title",
    description: "event.phase.pitching.text",
    action: "event.phase.pitching.action",
  },
  "pitch-voting": {
    title: "event.phase.pitchVoting.title",
    description: "event.phase.pitchVoting.text",
    action: "event.phase.pitchVoting.action",
  },
  "team-formation": {
    title: "event.phase.formation.title",
    description: "event.phase.formation.text",
    action: "event.phase.formation.action",
  },
  submissions: {
    title: "event.phase.submissions.title",
    description: "event.phase.submissions.text",
    action: "event.phase.submissions.action",
  },
  judging: {
    title: "event.phase.judging.title",
    description: "event.phase.judging.text",
    action: "event.phase.judging.action",
  },
  voting: {
    title: "event.phase.judging.title",
    description: "event.phase.judging.text",
    action: "event.phase.judging.action",
  },
  results: {
    title: "event.phase.results.title",
    description: "event.phase.results.text",
    action: "event.phase.results.action",
  },
} as const satisfies Record<
  EventDashboard["phase"],
  { title: TranslationKey; description: TranslationKey; action: TranslationKey }
>;

function PhaseFocus({ slug, data }: { slug: string; data: EventDashboard }) {
  const { t } = useI18n();
  const focus = PHASE_FOCUS_KEYS[data.phase];
  const href =
    data.phase === "results"
      ? `/e/${slug}/leaderboard`
      : data.phase === "voting"
        ? `/e/${slug}/vote`
        : ["upcoming", "pitching", "pitch-voting", "team-formation"].includes(data.phase)
          ? `/e/${slug}/pitches`
          : `/e/${slug}/projects`;
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="grid gap-5 py-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl">
            <Target className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t("event.currentPhase")}</Badge>
              <NextMilestone event={data.event} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">{t(focus.title)}</h2>
            <p className="text-muted-foreground text-sm">{t(focus.description)}</p>
          </div>
        </div>
        <Button nativeButton={false} render={<Link href={href} />}>
          {t(focus.action)} <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

const RESOURCE_GROUP = {
  scope: {
    label: "Scope under study",
    description: "Systems and data sources included in the analysis.",
    icon: Building2,
  },
  accessible: {
    label: "Accessible resources",
    description: "Resources the teams can actually consult or use.",
    icon: Database,
  },
  tool: {
    label: "Authorized tools",
    description: "Applications and tools approved for project work.",
    icon: Wrench,
  },
} as const;

const ACCESS_LABEL: Record<string, string> = {
  public: "Public",
  event: "Participants & coaches",
  restricted: "Restricted",
};

function EventAssistant({ slug, data }: { slug: string; data: EventDashboard }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState(data.assistant?.url ?? "");
  const canConfigure = Boolean(data.viewer?.isJudge || data.viewer?.canManage);

  const save = useMutation({
    mutationFn: (nextUrl: string | null) =>
      api.patch<{ assistant: { url: string } | null }>(`/api/events/${slug}/assistant`, {
        url: nextUrl,
      }),
    onSuccess: async (_result, nextUrl) => {
      toast.success(
        nextUrl ? t("event.assistant.saved") : t("event.assistant.removed")
      );
      await queryClient.invalidateQueries({ queryKey: eventKey(slug) });
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!data.assistant && !canConfigure) return null;

  function changeDialogOpen(open: boolean) {
    setDialogOpen(open);
    if (open) setUrl(data.assistant?.url ?? "");
  }

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="grid gap-5 py-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl">
            <Sparkles className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-semibold tracking-tight">{t("event.assistant.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {data.assistant
                ? t("event.assistant.description")
                : t("event.assistant.missing")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          {data.assistant && (
            <Button
              nativeButton={false}
              render={<a href={data.assistant.url} target="_blank" rel="noreferrer" />}
            >
              {t("event.assistant.open")} <ExternalLink data-icon="inline-end" />
            </Button>
          )}
          {canConfigure && (
            <Dialog open={dialogOpen} onOpenChange={changeDialogOpen}>
              <DialogTrigger
                render={<Button variant={data.assistant ? "outline" : "default"} />}
              >
                <Settings2 data-icon="inline-start" />
                {t(data.assistant ? "event.assistant.edit" : "event.assistant.configure")}
              </DialogTrigger>
              <DialogContent>
                <form
                  className="flex flex-col gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save.mutate(url.trim() || null);
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>{t("event.assistant.dialogTitle")}</DialogTitle>
                    <DialogDescription>{t("event.assistant.dialogHint")}</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="event-assistant-url" className="text-sm font-medium">
                      {t("event.assistant.url")}
                    </label>
                    <Input
                      id="event-assistant-url"
                      type="url"
                      inputMode="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder={t("event.assistant.urlPlaceholder")}
                      maxLength={2048}
                      required
                    />
                  </div>
                  <DialogFooter className="sm:justify-between">
                    {data.assistant ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => save.mutate(null)}
                        disabled={save.isPending}
                      >
                        {t("event.assistant.remove")}
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button type="submit" disabled={save.isPending || !url.trim()}>
                      {save.isPending ? <Spinner /> : <Sparkles />}
                      {t("event.assistant.save")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AuditAndResources({ slug, data }: { slug: string; data: EventDashboard }) {
  const audit = data.audit;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle icon={FileSearch}>Audit and operational scope</SectionTitle>
        {data.viewer?.canManage && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/manage/${slug}/workspace`} />}
          >
            <Settings2 data-icon="inline-start" /> Manage content
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>{audit?.title ?? "Initial company audit"}</CardTitle>
              <CardDescription>
                {audit
                  ? `Current document · version ${audit.version}`
                  : "Read-only reference document"}
              </CardDescription>
            </div>
            {audit && <Badge variant="secondary">Version {audit.version}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {audit ? (
            <>
              {audit.summary && <p className="text-muted-foreground text-sm">{audit.summary}</p>}
              <div className="grid gap-5 md:grid-cols-2">
                <AuditList title="Main findings" items={audit.findings} />
                <AuditList title="Identified problems" items={audit.problems} />
              </div>
              <Button
                className="self-start"
                nativeButton={false}
                render={<a href={audit.url} target="_blank" rel="noreferrer" />}
              >
                Open the full audit <ExternalLink data-icon="inline-end" />
              </Button>
            </>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSearch />
                </EmptyMedia>
                <EmptyTitle>No audit document published</EmptyTitle>
                <EmptyDescription>
                  The organizing team has not added the initial audit yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={Database} hint={pluralize(data.resources.length, "resource")}>
          Perimeter and resources
        </SectionTitle>
        {data.resources.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {(Object.keys(RESOURCE_GROUP) as (keyof typeof RESOURCE_GROUP)[]).map((kind) => {
              const group = RESOURCE_GROUP[kind];
              const items = data.resources.filter((resource) => resource.kind === kind);
              const Icon = group.icon;
              return (
                <Card key={kind} size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="text-muted-foreground size-4" /> {group.label}
                    </CardTitle>
                    <CardDescription>{group.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {items.length ? (
                      <ul className="flex flex-col gap-3">
                        {items.map((resource) => (
                          <li
                            key={resource.id}
                            className="flex flex-col gap-2 rounded-lg border p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{resource.name}</p>
                                <p className="text-muted-foreground text-xs">{resource.category}</p>
                              </div>
                              <Badge
                                variant={
                                  resource.availability === "unavailable"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {resource.availability}
                              </Badge>
                            </div>
                            {resource.description && (
                              <p className="text-muted-foreground text-sm">
                                {resource.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {ACCESS_LABEL[resource.accessLevel] ?? resource.accessLevel}
                              </Badge>
                              {resource.ownerName && (
                                <span className="text-muted-foreground text-xs">
                                  Owner: {resource.ownerName}
                                </span>
                              )}
                            </div>
                            {resource.url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="self-start"
                                nativeButton={false}
                                render={<a href={resource.url} target="_blank" rel="noreferrer" />}
                              >
                                Open resource <ExternalLink data-icon="inline-end" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground py-4 text-center text-sm">
                        Nothing listed in this category.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Database />
              </EmptyMedia>
              <EmptyTitle>No operational resource listed</EmptyTitle>
              <EmptyDescription>
                Resources will appear here after the organizers define the working perimeter.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}

function AuditList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No item documented.</p>
      )}
    </div>
  );
}

function EventSchedule({ slug, data }: { slug: string; data: EventDashboard }) {
  const queryClient = useQueryClient();
  const [privateUrl, setPrivateUrl] = useState<string | null>(null);
  const canSubscribe = Boolean(
    data.viewer?.registered || data.viewer?.isJudge || data.viewer?.canManage
  );
  const subscriptionQuery = useQuery({
    queryKey: [...eventKey(slug), "calendar-subscription"],
    queryFn: () =>
      api.get<{
        subscription: null | {
          id: string;
          prefix: string;
          createdAt: string;
          lastUsedAt: string | null;
        };
      }>(`/api/events/${slug}/calendar-subscription`),
    enabled: canSubscribe,
  });
  const createSubscription = useMutation({
    mutationFn: () =>
      api.post<{ url: string; prefix: string }>(`/api/events/${slug}/calendar-subscription`),
    onSuccess: async (result) => {
      setPrivateUrl(result.url);
      toast.success("Private calendar link generated");
      await queryClient.invalidateQueries({
        queryKey: [...eventKey(slug), "calendar-subscription"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const revokeSubscription = useMutation({
    mutationFn: () => api.delete(`/api/events/${slug}/calendar-subscription`),
    onSuccess: async () => {
      setPrivateUrl(null);
      toast.success("Calendar link revoked");
      await queryClient.invalidateQueries({
        queryKey: [...eventKey(slug), "calendar-subscription"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const groups = data.schedule.reduce<Map<string, EventDashboard["schedule"]>>((map, item) => {
    const key = new Date(item.startsAt).toDateString();
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
    return map;
  }, new Map());

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle icon={CalendarDays} hint={pluralize(data.schedule.length, "activity")}>
          Innovation Lab calendar
        </SectionTitle>
        {data.viewer?.canManage && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/manage/${slug}/schedule`} />}
          >
            <Settings2 data-icon="inline-start" /> Manage calendar
          </Button>
        )}
      </div>

      {data.schedule.length ? (
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([day, items]) => (
            <Card key={day} size="sm">
              <CardHeader>
                <CardTitle className="text-base">
                  {formatDate(items[0]?.startsAt, { dateStyle: "full" })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="grid gap-2 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[150px_minmax(0,1fr)]"
                    >
                      <div className="text-sm font-medium tabular-nums">
                        {formatDate(item.startsAt, { timeStyle: "short" })} –{" "}
                        {formatDate(item.endsAt, { timeStyle: "short" })}
                      </div>
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{item.title}</p>
                            {item.location && (
                              <p className="text-muted-foreground text-sm">{item.location}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {SCHEDULE_KIND_LABELS[item.kind as ScheduleKind] ?? item.kind}
                            </Badge>
                            {item.required && <Badge>Mandatory</Badge>}
                          </div>
                        </div>
                        {item.description && (
                          <p className="text-muted-foreground text-sm">{item.description}</p>
                        )}
                        <p className="text-muted-foreground text-xs">
                          Audience:{" "}
                          {SCHEDULE_AUDIENCE_LABELS[item.audience as ScheduleAudience] ??
                            item.audience}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>No activity scheduled</EmptyTitle>
            <EmptyDescription>
              The organizing team has not published the calendar yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Outlook and iCalendar</CardTitle>
          <CardDescription>
            Calendar applications decide their own refresh frequency; Juryza publishes updates
            immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.event.visibility === "published" ? (
            <Button
              variant="outline"
              className="self-start"
              nativeButton={false}
              render={<a href={`/api/events/${slug}/calendar.ics`} />}
            >
              <CalendarDays data-icon="inline-start" /> Download public calendar
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              The public feed becomes available when this event is published.
            </p>
          )}
          {canSubscribe &&
            (privateUrl ? (
              <div className="flex flex-col gap-2">
                <Input aria-label="Private calendar URL" value={privateUrl} readOnly />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(privateUrl);
                      toast.success("Calendar URL copied");
                    }}
                  >
                    <Copy data-icon="inline-start" /> Copy subscription URL
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<a href={privateUrl} />}
                  >
                    <CalendarDays data-icon="inline-start" /> Open feed
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  This secret URL is shown once. Add it to Outlook as an internet calendar and do
                  not share it.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <Button
                  onClick={() => createSubscription.mutate()}
                  disabled={createSubscription.isPending || subscriptionQuery.isLoading}
                >
                  {createSubscription.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <CalendarDays data-icon="inline-start" />
                  )}
                  {subscriptionQuery.data?.subscription
                    ? "Replace private link"
                    : "Generate private Outlook link"}
                </Button>
                {subscriptionQuery.data?.subscription && (
                  <p className="text-muted-foreground text-xs">
                    A private feed beginning with {subscriptionQuery.data.subscription.prefix}… is
                    active. Replacing it revokes the previous URL.
                  </p>
                )}
              </div>
            ))}
        </CardContent>
        {subscriptionQuery.data?.subscription && (
          <CardFooter className="justify-end border-t">
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                <X data-icon="inline-start" /> Revoke private link
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke the private calendar link?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Outlook and other calendar applications will no longer be able to refresh
                    private activities with this URL.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep link</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={revokeSubscription.isPending}
                    onClick={() => revokeSubscription.mutate()}
                  >
                    <X data-icon="inline-start" /> Revoke link
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        )}
      </Card>
    </section>
  );
}

function projectJoinGuidance(
  state: EventDashboard["selectedProjects"][number]["joinState"],
  t: (key: TranslationKey) => string
): string | null {
  switch (state) {
    case "sign-in-required":
      return t("journey.join.signIn");
    case "registration-required":
      return t("journey.join.register");
    case "team-pending":
      return t("journey.join.pendingTeam");
    case "requested":
      return t("journey.join.requested");
    case "already-on-team":
      return t("journey.join.otherProject");
    case "full":
      return t("journey.join.full");
    case "closed":
      return t("journey.join.closed");
    default:
      return null;
  }
}

function InnolabJourney({ slug, data }: { slug: string; data: EventDashboard }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const beforeSelection = ["upcoming", "pitching", "pitch-voting"].includes(data.phase);
  const ideas = data.ideas.slice(0, 3);
  const canSeeOperationalData = Boolean(
    data.viewer?.registered || data.viewer?.isJudge || data.viewer?.canManage
  );
  const canReviewRequests = Boolean(data.viewer?.isJudge || data.viewer?.canManage);
  const joinProject = useMutation({
    mutationFn: (teamId: string) =>
      api.post<{ requestId: string; status: "pending" }>(`/api/teams/${teamId}/join`),
    onSuccess: (_result, teamId) => {
      toast.success(t("journey.requestSent"), {
        description: t("journey.requestSentHint"),
      });
      queryClient.invalidateQueries({ queryKey: eventKey(slug) });
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    },
    onError: (err) => toast.error(err.message),
  });
  const cancelJoinRequest = useMutation({
    mutationFn: (teamId: string) =>
      api.delete<{ status: "cancelled" }>(`/api/teams/${teamId}/join`),
    onSuccess: (_result, teamId) => {
      toast.success(t("journey.requestCancelled"));
      queryClient.invalidateQueries({ queryKey: eventKey(slug) });
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    },
    onError: (err) => toast.error(err.message),
  });
  if (beforeSelection) {
    return (
      <section className="flex flex-col gap-3">
        <SectionTitle icon={Lightbulb} hint={String(data.ideas.length)}>
          {t("journey.pitches")}
        </SectionTitle>
        {ideas.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {ideas.map((idea) => (
              <Card key={idea.id} size="sm">
                <CardHeader>
                  <CardTitle className="line-clamp-2 text-base">{idea.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <UserAvatar
                      name={idea.author.name}
                      image={idea.author.image}
                      className="size-5"
                    />
                    <span className="truncate">{idea.author.name}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-muted-foreground line-clamp-3 text-sm">{idea.description}</p>
                  {idea.votes !== null && (
                    <Badge variant="secondary" className="self-start">
                      <Vote /> {pluralize(idea.votes, "vote")}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Alert>
            <Lightbulb />
            <AlertTitle>{t("journey.noPitch")}</AlertTitle>
            <AlertDescription>{t("journey.noPitchHint")}</AlertDescription>
          </Alert>
        )}
        <Button
          variant="outline"
          className="self-start"
          nativeButton={false}
          render={<Link href={`/e/${slug}/pitches`} />}
        >
          {t("journey.allPitches")} <ArrowRight data-icon="inline-end" />
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={Rocket} hint={String(data.selectedProjects.length)}>
        {t("journey.selectedProjects")}
      </SectionTitle>
      {data.selectedProjects.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.selectedProjects.map((selected) => {
            const joining = joinProject.isPending && joinProject.variables === selected.team?.id;
            const joinGuidance = projectJoinGuidance(selected.joinState, t);
            const registrationLabel = !canSeeOperationalData
              ? t("journey.selected")
              : selected.team?.registrationState === "open"
                ? t("journey.registrationOpen")
                : selected.team?.registrationState === "full"
                  ? t("journey.teamFull")
                  : selected.team
                    ? t("journey.registrationClosed")
                    : t("journey.teamForming");
            return (
              <Card key={selected.pitchId} size="sm">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-base">{selected.title}</CardTitle>
                    <Badge
                      variant={
                        selected.team?.registrationState === "open" ? "default" : "secondary"
                      }
                    >
                      {registrationLabel}
                    </Badge>
                  </div>
                  <CardDescription>
                    {t("journey.ledBy")} {selected.author.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-muted-foreground line-clamp-3 text-sm">
                    {selected.description}
                  </p>
                  {selected.team ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{selected.team.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {selected.team.memberCount}/{selected.team.capacity} {t("journey.members")}
                      </span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {canSeeOperationalData
                        ? t("journey.ownerForming")
                        : t("journey.signInDetails")}
                    </p>
                  )}
                  {joinGuidance && <p className="text-muted-foreground text-xs">{joinGuidance}</p>}
                </CardContent>
                <CardFooter className="flex-wrap">
                  {selected.joinState === "available" && selected.team && (
                    <Button
                      onClick={() => joinProject.mutate(selected.team?.id ?? "")}
                      disabled={joinProject.isPending}
                    >
                      {joining ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <UserPlus data-icon="inline-start" />
                      )}
                      {t("journey.request")}
                    </Button>
                  )}
                  {selected.joinState === "requested" && selected.team && (
                    <Button
                      variant="outline"
                      onClick={() => cancelJoinRequest.mutate(selected.team?.id ?? "")}
                      disabled={cancelJoinRequest.isPending}
                    >
                      {cancelJoinRequest.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <X data-icon="inline-start" />
                      )}
                      {t("journey.cancel")}
                    </Button>
                  )}
                  {selected.joinState === "joined" && selected.team && (
                    <Button
                      nativeButton={false}
                      render={<Link href={`/teams/${selected.team.id}`} />}
                    >
                      <UsersRound data-icon="inline-start" /> {t("journey.myProject")}
                    </Button>
                  )}
                  {canReviewRequests && selected.team && (
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/teams/${selected.team.id}`} />}
                    >
                      <UsersRound data-icon="inline-start" /> {t("journey.reviewRequests")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={
                      <Link
                        href={
                          selected.projectId
                            ? `/projects/${selected.projectId}`
                            : `/e/${slug}/pitches`
                        }
                      />
                    }
                  >
                    {t("journey.openProject")} <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Alert>
          <CircleAlert />
          <AlertTitle>{t("journey.notPublished")}</AlertTitle>
          <AlertDescription>{t("journey.notPublishedHint")}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-2">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Icon className="text-muted-foreground size-5" /> {children}
      </h2>
      {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
    </div>
  );
}

function Announcements({ items }: { items: EventDetail["announcements"] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={Megaphone} hint="From the organizing team">
        Important communications
      </SectionTitle>
      <div className="flex flex-col gap-2">
        {items.map((a) => {
          const document = parseRichDoc(a.body);
          const summary = docToText(document, 260);
          return (
            <Card
              key={a.id}
              size="sm"
              className={cn(
                a.pinned && "border-primary/30 bg-primary/5",
                a.priority === "urgent" && "border-destructive/40"
              )}
            >
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  {a.pinned && <Pin className="text-primary size-3.5" aria-label="Pinned" />}
                  <Badge
                    variant={
                      a.priority === "urgent"
                        ? "destructive"
                        : a.priority === "important"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {a.priority}
                  </Badge>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                </div>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  <UserAvatar
                    name={a.authorName ?? "Organizer"}
                    image={a.authorImage}
                    className="size-5"
                  />
                  <span>{a.authorName ?? "Organizing team"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{relativeTime(a.createdAt)}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-3">
                <p className="text-muted-foreground line-clamp-3 text-sm">{summary}</p>
                <Dialog>
                  <DialogTrigger render={<Button variant="ghost" size="sm" />}>
                    <Eye data-icon="inline-start" /> Read full communication
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{a.title}</DialogTitle>
                      <DialogDescription>
                        Published by {a.authorName ?? "the organizing team"}{" "}
                        {relativeTime(a.createdAt)}
                      </DialogDescription>
                    </DialogHeader>
                    <RichContent doc={document} />
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function Tracks({ tracks }: { tracks: EventDetail["tracks"] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={Layers} hint={pluralize(tracks.length, "track")}>
        Tracks
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {tracks.map((t, i) => (
          <div key={t.id} className="flex gap-3 rounded-xl border p-4">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{t.name}</p>
              {t.description && <p className="text-muted-foreground text-sm">{t.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PRIZE_GROUP = {
  overall: { label: "Overall", icon: Trophy },
  track: { label: "Track prizes", icon: Layers },
  community: { label: "Community choice", icon: Vote },
} as const;

function Prizes({ data }: { data: EventDetail }) {
  const trackName = new Map(data.tracks.map((t) => [t.id, t.name]));
  const groups = (Object.keys(PRIZE_GROUP) as (keyof typeof PRIZE_GROUP)[])
    .map((kind) => ({ kind, items: data.prizes.filter((p) => p.kind === kind) }))
    .filter((g) => g.items.length > 0);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={Award}>Prizes</SectionTitle>
      <div className="flex flex-col gap-5">
        {groups.map((g) => {
          const G = PRIZE_GROUP[g.kind];
          return (
            <div key={g.kind} className="flex flex-col gap-2">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase">
                <G.icon className="size-3.5" /> {G.label}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((p) => (
                  <div key={p.id} className="bg-card flex items-start gap-3 rounded-xl border p-4">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        p.rank === 1
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Trophy className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="font-medium">{p.name}</p>
                        {p.amount && (
                          <p className="text-primary font-semibold tabular-nums">{p.amount}</p>
                        )}
                      </div>
                      {p.kind === "track" && p.trackId && trackName.get(p.trackId) && (
                        <p className="text-muted-foreground text-xs">{trackName.get(p.trackId)}</p>
                      )}
                      {p.description && (
                        <p className="text-muted-foreground mt-1 text-sm">{p.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Criteria({ criteria }: { criteria: EventDetail["criteria"] }) {
  const total = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={Gavel} hint="Scores are normalized per judge">
        Judging criteria
      </SectionTitle>
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {criteria.map((c, i) => {
            const pct = Math.round((c.weight / total) * 100);
            return (
              <li
                key={c.id}
                className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.label}</p>
                  {c.description && (
                    <p className="text-muted-foreground text-sm">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 sm:w-52">
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: `var(--chart-${(i % 5) + 1})` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function Judges({ judges }: { judges: EventDetail["judges"] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={Sparkles} hint={pluralize(judges.length, "judge")}>
        Judging panel
      </SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {judges.map((j) => {
          const inner = (
            <>
              <UserAvatar name={j.name} image={j.image} className="size-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{j.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {j.headline || (j.username ? `@${j.username}` : "Judge")}
                </p>
              </div>
            </>
          );
          return j.username ? (
            <Link
              key={j.id}
              href={`/u/${j.username}`}
              className="hover:bg-muted/50 flex items-center gap-3 rounded-xl border p-3 transition-colors"
            >
              {inner}
            </Link>
          ) : (
            <div key={j.id} className="flex items-center gap-3 rounded-xl border p-3">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                            */
/* ------------------------------------------------------------------ */

type TeamDetail = {
  team: { id: string; name: string; inviteUrl?: string };
  members: { id: string }[];
  project: { id: string; title: string; status: string } | null;
};

function Participation({ slug, data }: { slug: string; data: EventDetail }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const e = data.event;
  const v = data.viewer;
  const open = submissionsAreOpen(e);
  const phase = phaseOf(e);
  const next = encodeURIComponent(`/e/${slug}`);
  const { t: translate } = useI18n();

  const teamQuery = useQuery({
    queryKey: ["team", v?.team?.id],
    queryFn: () => api.get<TeamDetail>(`/api/teams/${v?.team?.id}`),
    enabled: Boolean(v?.team),
  });

  const register = useMutation({
    mutationFn: () => api.post(`/api/events/${slug}/registration`),
    onSuccess: () => {
      toast.success(translate("event.registered"));
      queryClient.invalidateQueries({ queryKey: eventKey(slug) });
    },
    onError: (err) => toast.error(err.message),
  });

  const start = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(`/api/events/${slug}/projects`, { title: title.trim() }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: eventKey(slug) });
      router.push(`/projects/${r.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  let body: React.ReactNode;
  if (e.workflow === "innolab") {
    if (!v) {
      body = (
        <>
          <p className="text-muted-foreground text-sm">{translate("event.signInToParticipate")}</p>
          <Button nativeButton={false} render={<Link href={`/login?next=${next}`} />}>
            <LogIn /> {translate("site.signIn")}
          </Button>
        </>
      );
    } else if (v.team) {
      const t = teamQuery.data;
      body = (
        <>
          <Link
            href={`/teams/${v.team.id}`}
            className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
          >
            <UsersRound className="text-primary size-5" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.team.name}</span>
            <ArrowRight className="text-muted-foreground size-4" />
          </Link>
          {t?.project && (
            <Button nativeButton={false} render={<Link href={`/projects/${t.project.id}`} />}>
              <Rocket /> {translate("event.openProject")}
            </Button>
          )}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/e/${slug}/pitches`} />}
          >
            <Lightbulb /> {translate("event.originalPitches")}
          </Button>
        </>
      );
    } else if (!v.registered && eventRegistrationIsOpen(e)) {
      body = (
        <>
          <p className="text-muted-foreground text-sm">{translate("event.registerHint")}</p>
          <Button onClick={() => register.mutate()} disabled={register.isPending}>
            {register.isPending ? <Spinner /> : <Check />} {translate("event.register")}
          </Button>
        </>
      );
    } else {
      body = (
        <>
          {v.registered && (
            <div className="bg-success/10 text-success flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
              <Check className="size-4" /> {translate("event.registered")}
            </div>
          )}
          <p className="text-muted-foreground text-sm">{translate("event.boardHint")}</p>
          <Button nativeButton={false} render={<Link href={`/e/${slug}/pitches`} />}>
            <Lightbulb /> {translate("event.openPitches")}
          </Button>
        </>
      );
    }
  } else if (!v) {
    body = (
      <>
        <p className="text-muted-foreground text-sm">
          {open
            ? "Create a free account to register, form a team and submit a project."
            : "Sign in to follow this event, comment and vote."}
        </p>
        <div className="flex flex-col gap-2">
          <Button nativeButton={false} render={<Link href={`/signup?next=${next}`} />}>
            <UserPlus /> Sign up to participate
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/login?next=${next}`} />}
          >
            <LogIn /> I already have an account
          </Button>
        </div>
      </>
    );
  } else if (v.team) {
    const t = teamQuery.data;
    body = (
      <>
        <Link
          href={`/teams/${v.team.id}`}
          className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
        >
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
            <UsersRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{v.team.name}</p>
            <p className="text-muted-foreground text-xs capitalize">
              {v.team.role}
              {t && ` · ${t.members.length}/${e.maxTeamSize} members`}
            </p>
          </div>
          <ArrowRight className="text-muted-foreground size-4" />
        </Link>
        {teamQuery.isLoading ? (
          <Skeleton className="h-9 rounded-lg" />
        ) : t?.project ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{t.project.title}</span>
              <Badge
                variant={t.project.status === "submitted" ? "default" : "secondary"}
                className="capitalize"
              >
                {t.project.status}
              </Badge>
            </div>
            <Button nativeButton={false} render={<Link href={`/projects/${t.project.id}`} />}>
              <PencilLine /> Open project
            </Button>
          </div>
        ) : open ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              start.mutate();
            }}
          >
            <label htmlFor="project-title" className="text-sm font-medium">
              Start your project
            </label>
            <Input
              id="project-title"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              placeholder="Project title"
              maxLength={100}
              required
            />
            <Button type="submit" disabled={start.isPending || !title.trim()}>
              {start.isPending ? <Spinner /> : <Rocket />} Start project
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">
            Submissions are closed — your team didn't submit a project.
          </p>
        )}
      </>
    );
  } else if (open && !v.registered) {
    body = (
      <>
        <p className="text-muted-foreground text-sm">
          Register to take part. Teams of up to {e.maxTeamSize} — you can join one or start your own
          next.
        </p>
        <Button onClick={() => register.mutate()} disabled={register.isPending}>
          {register.isPending ? <Spinner /> : <Check />} Register for {e.name}
        </Button>
      </>
    );
  } else if (open) {
    body = (
      <>
        <div className="bg-success/10 text-success flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
          <Check className="size-4" /> You're registered
        </div>
        <p className="text-muted-foreground text-sm">
          Next: team up. Start a team and invite people, or join one that's looking.
        </p>
        <div className="flex flex-col gap-2">
          <CreateTeamDialog
            slug={slug}
            trigger={
              <Button>
                <UsersRound /> Create a team
              </Button>
            }
          />
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/e/${slug}/teams`} />}
          >
            Find a team
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-muted-foreground text-sm">
          {phase === "upcoming"
            ? `Registration opens ${formatDate(e.submissionsOpen, { dateStyle: "long" })}.`
            : "Submissions are closed for this event."}
        </p>
        {phase !== "upcoming" && (
          <div className="flex flex-col gap-2">
            {hasVoting(e) && phase === "voting" && (
              <Button nativeButton={false} render={<Link href={`/e/${slug}/vote`} />}>
                <Vote /> Vote for projects
              </Button>
            )}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/e/${slug}/projects`} />}
            >
              Browse projects
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <Card className="border-primary/20 ring-primary/15 shadow-sm">
      <CardHeader>
        <CardTitle>{translate("event.participation")}</CardTitle>
        <CardDescription>{v ? "What you can do next" : "Join the event"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {body}
        {v && (v.isJudge || v.canManage) && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              {v.isJudge && (
                <Button
                  variant="secondary"
                  nativeButton={false}
                  render={<Link href={`/judging/${slug}`} />}
                >
                  <Gavel /> Go to judging
                </Button>
              )}
              {v.canManage && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/manage/${slug}`} />}
                >
                  <Settings2 /> Manage
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const VOTING_ACCESS: Record<string, string> = {
  open: "Anyone with the link",
  email: "Verified email domains",
  authenticated: "Signed-in accounts",
};

function KeyFacts({ data }: { data: EventDetail }) {
  const e = data.event;
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Team size", value: `Up to ${e.maxTeamSize}` },
    {
      label: "Format",
      value: (
        <span className="capitalize">{e.location ? `${e.mode} · ${e.location}` : e.mode}</span>
      ),
    },
    { label: "Teams", value: data.counts.teams },
    { label: "Reviews per project", value: e.reviewsPerProject },
  ];
  if (hasVoting(e)) {
    facts.push({
      label: "Community voting",
      value: VOTING_ACCESS[e.votingAccess] ?? e.votingAccess,
    });
    facts.push({ label: "Vote credits", value: `${e.voteBudget} (quadratic)` });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Key facts</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2.5 text-sm">
          {facts.map((f) => (
            <div key={f.label} className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-right font-medium tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ShareCard({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Share2 className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">Invite friends to {name}</span>
        </div>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Link2 />} {copied ? "Copied" : "Copy link"}
        </Button>
      </CardContent>
    </Card>
  );
}
