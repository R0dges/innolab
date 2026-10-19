"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  CalendarClock,
  Check,
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
  Trophy,
  UserPlus,
  UsersRound,
  Vote,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";
import { Input } from "@juryza/ui/components/ui/input";
import { Separator } from "@juryza/ui/components/ui/separator";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { cn } from "@juryza/ui/lib/utils";

import { RichContent } from "@/components/editor/rich-content";
import { Timeline } from "@/components/event-bits";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatDate, pluralize, relativeTime } from "@/lib/format";
import { eventRegistrationIsOpen } from "@/lib/innolab";
import { hasVoting, phaseOf, submissionsAreOpen } from "@/lib/phase";
import { type EventDetail, eventKey, useEvent } from "@/lib/queries";
import { isEmptyDoc, parseRichDoc } from "@/lib/rich-text";

import { CreateTeamDialog } from "./create-team-dialog";

/**
 * Event overview tab: the organizer's write-up, rules, tracks, prizes, rubric
 * and judging panel, with a sidebar that tells the viewer what to do next.
 * (Hero and tabs come from the /e/[slug] layout.)
 */

export default function EventOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useEvent(slug);

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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-8">
        {data.announcements.length > 0 && <Announcements items={data.announcements} />}

        <section className="flex flex-col gap-3">
          <h2 className="sr-only">About</h2>
          <RichContent
            doc={e.content}
            empty={
              <p className="text-muted-foreground">
                {e.description || "The organizers haven't written an overview yet."}
              </p>
            }
          />
        </section>

        {data.tracks.length > 0 && <Tracks tracks={data.tracks} />}
        {data.prizes.length > 0 && <Prizes data={data} />}
        {data.criteria.length > 0 && <Criteria criteria={data.criteria} />}

        {!isEmptyDoc(e.rules) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="text-muted-foreground size-4" /> Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RichContent
                doc={e.rules}
                empty={<p className="text-muted-foreground">No rules published.</p>}
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
              <CalendarClock className="text-muted-foreground size-4" /> Timeline
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
  );
}

/* ------------------------------------------------------------------ */
/* Main column                                                        */
/* ------------------------------------------------------------------ */

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
      <SectionTitle icon={Megaphone}>Announcements</SectionTitle>
      <div className="flex flex-col gap-2">
        {items.map((a) => (
          <div
            key={a.id}
            className={cn(
              "flex flex-col gap-1 rounded-xl border p-4",
              a.pinned && "border-primary/30 bg-primary/5"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {a.pinned && <Pin className="text-primary size-3.5" aria-label="Pinned" />}
              <p className="font-medium">{a.title}</p>
              <span className="text-muted-foreground text-xs">{relativeTime(a.createdAt)}</span>
            </div>
            <RichContent doc={parseRichDoc(a.body)} className="text-muted-foreground text-sm" />
          </div>
        ))}
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

  const teamQuery = useQuery({
    queryKey: ["team", v?.team?.id],
    queryFn: () => api.get<TeamDetail>(`/api/teams/${v?.team?.id}`),
    enabled: Boolean(v?.team),
  });

  const register = useMutation({
    mutationFn: () => api.post(`/api/events/${slug}/registration`),
    onSuccess: () => {
      toast.success("You're registered");
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
          <p className="text-muted-foreground text-sm">
            Create an account to register, propose an idea and take part in the preselection.
          </p>
          <Button nativeButton={false} render={<Link href={`/signup?next=${next}`} />}>
            <UserPlus /> Sign up to participate
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
              <Rocket /> Open project
            </Button>
          )}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/e/${slug}/pitches`} />}
          >
            <Lightbulb /> View original ideas
          </Button>
        </>
      );
    } else if (!v.registered && eventRegistrationIsOpen(e)) {
      body = (
        <>
          <p className="text-muted-foreground text-sm">
            Register without a team. You can propose an idea first and form a team only if it is
            selected.
          </p>
          <Button onClick={() => register.mutate()} disabled={register.isPending}>
            {register.isPending ? <Spinner /> : <Check />} Register for {e.name}
          </Button>
        </>
      );
    } else {
      body = (
        <>
          {v.registered && (
            <div className="bg-success/10 text-success flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
              <Check className="size-4" /> You're registered
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            Ideas, voting, selection and project creation all continue from the Innolab board.
          </p>
          <Button nativeButton={false} render={<Link href={`/e/${slug}/pitches`} />}>
            <Lightbulb /> Open ideas
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
        <CardTitle>Your participation</CardTitle>
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
