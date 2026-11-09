"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CalendarDays,
  Coins,
  ExternalLink,
  FolderKanban,
  Gavel,
  GitBranch,
  Globe,
  MapPin,
  PencilLine,
  Sparkles,
  Star,
  Trophy,
  UserX,
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

import { RichContent } from "@/components/editor/rich-content";
import { UserAvatar } from "@/components/user-avatar";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { formatDate, hueOf } from "@/lib/format";
import { parseRichDoc } from "@/lib/rich-text";
import type { publicProfile } from "@/lib/server/people";
import type { Json } from "@/lib/types";

/** Public profile: who someone is, what they've built, where they've judged. */

type Profile = Json<NonNullable<Awaited<ReturnType<typeof publicProfile>>>>;

const ROLE_LABEL: Record<string, string> = {
  participant: "Participant",
  judge: "Judge",
  organizer: "Organizer",
  admin: "Admin",
};

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function githubHandle(url: string) {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "") || "GitHub";
  } catch {
    return "GitHub";
  }
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const viewer = useViewer();
  const { data, isLoading, error } = useQuery({
    queryKey: ["user", username],
    queryFn: () => api.get<Profile>(`/api/users/${encodeURIComponent(username)}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Empty className="my-24">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserX />
          </EmptyMedia>
          <EmptyTitle>No such user</EmptyTitle>
          <EmptyDescription>There's no profile at @{username}.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
            Browse events
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const { user: u, projects, judged, certificates, participatedEvents } = data;
  const isMe = viewer?.userId === u.id;
  const hue = hueOf(u.name);

  return (
    <div className="flex flex-col">
      <div
        className="h-32 border-b sm:h-44"
        style={{
          background: `linear-gradient(135deg, oklch(0.7 0.12 ${hue} / 0.35), oklch(0.6 0.14 ${(hue + 60) % 360} / 0.2))`,
        }}
        aria-hidden
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 sm:px-6">
        <header className="-mt-14 flex flex-col gap-5 sm:-mt-16">
          <div className="flex items-end justify-between gap-4">
            <UserAvatar
              name={u.name}
              image={u.image}
              className="ring-background size-24 ring-4 shadow-xl sm:size-32"
            />
            <div className="flex items-center gap-2">
              {u.githubUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a
                      href={u.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5"
                    />
                  }
                >
                  <GitBranch className="size-4" /> GitHub <ExternalLink className="size-3" />
                </Button>
              )}
              {isMe && (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/settings/profile" />}
                >
                  <PencilLine className="size-4" /> Edit profile
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{u.name}</h1>
              {u.role !== "participant" && (
                <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
              )}
              {u.lookingForTeam && (
                <Badge className="bg-success/15 text-success">
                  <Sparkles className="size-3" /> Open to teams
                </Badge>
              )}
              {u.rank && (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Trophy className="size-3" /> Rank #{u.rank} Overall
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground font-mono text-sm">@{u.username}</p>
            {u.headline && <p className="text-lg font-medium text-pretty">{u.headline}</p>}
          </div>

          {/* Platform Performance Stats Bar */}
          {(u.points > 0 || u.prizeUsd > 0 || u.awardsCount > 0 || (u.rank ?? 0) > 0) && (
            <div className="bg-muted/40 grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-4">
              <div className="flex flex-col">
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Trophy className="size-3.5 text-amber-500" /> Platform Standing
                </span>
                <span className="text-xl font-bold tracking-tight">
                  {u.rank ? `#${u.rank}` : "Top 100"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Star className="size-3.5 text-indigo-500" /> Total Points
                </span>
                <span className="text-xl font-bold tracking-tight tabular-nums">
                  {u.points} pts
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Coins className="size-3.5 text-emerald-500" /> DZcoin
                </span>
                <span className="text-xl font-bold tracking-tight text-emerald-600 tabular-nums dark:text-emerald-400">
                  {(u.prizeUsd ?? 0).toLocaleString()} DZcoin
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Award className="size-3.5 text-purple-500" /> Hackathon Awards
                </span>
                <span className="text-xl font-bold tracking-tight tabular-nums">
                  {u.awardsCount || projects.length}
                </span>
              </div>
            </div>
          )}

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {u.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {u.location}
              </span>
            )}
            {u.websiteUrl && (
              <a
                href={u.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:text-foreground flex items-center gap-1.5"
              >
                <Globe className="size-4" /> {hostOf(u.websiteUrl)}
              </a>
            )}
            {u.githubUrl && (
              <a
                href={u.githubUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:text-foreground flex items-center gap-1.5"
              >
                <GitBranch className="size-4" /> {githubHandle(u.githubUrl)}
              </a>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" /> Joined{" "}
              {formatDate(u.createdAt, { month: "long", year: "numeric" })}
            </span>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-10">
            {u.bio && (
              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold tracking-tight">About</h2>
                <RichContent
                  doc={parseRichDoc(u.bio)}
                  className="text-muted-foreground text-[0.95rem] leading-relaxed"
                />
              </section>
            )}

            {/* Submitted Projects */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <FolderKanban className="text-muted-foreground size-5" /> Submitted Projects
                  <span className="text-muted-foreground text-xs font-normal">
                    ({projects.length})
                  </span>
                </h2>
              </div>
              {projects.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {projects.map((p) => {
                    const ph = hueOf(p.title);
                    return (
                      <Link
                        key={p.id}
                        href={`/e/${p.eventSlug}/projects/${p.id}`}
                        className="group focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-2"
                      >
                        <Card className="h-full gap-0 overflow-hidden py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
                          {p.thumbnailUrl ? (
                            // biome-ignore lint/performance/noImgElement: user-supplied thumbnail
                            <img
                              src={p.thumbnailUrl}
                              alt=""
                              className="aspect-2/1 w-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex aspect-2/1 w-full items-end p-3 text-white"
                              style={{
                                background: `linear-gradient(135deg, oklch(0.65 0.16 ${ph}), oklch(0.45 0.18 ${(ph + 60) % 360}))`,
                              }}
                              aria-hidden
                            >
                              <span className="rounded bg-black/30 px-2 py-0.5 text-xs font-semibold backdrop-blur">
                                {p.eventName}
                              </span>
                            </div>
                          )}
                          <CardContent className="flex flex-col gap-1.5 p-4">
                            <p className="font-semibold group-hover:underline">{p.title}</p>
                            {p.tagline && (
                              <p className="text-muted-foreground line-clamp-2 text-sm">
                                {p.tagline}
                              </p>
                            )}
                            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                              <span>Team: {p.teamName}</span>
                              <span>{formatDate(p.submittedAt)}</span>
                            </div>
                            {p.techTags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {p.techTags.slice(0, 4).map((t) => (
                                  <Badge key={t} variant="outline" className="text-xs">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty className="border py-10">
                  <EmptyHeader>
                    <EmptyTitle>No submitted projects yet</EmptyTitle>
                    <EmptyDescription>
                      {isMe
                        ? "Join an event and submit a project — it'll show up here."
                        : "Projects appear here once submitted."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {isMe && (
                    <EmptyContent>
                      <Button size="sm" nativeButton={false} render={<Link href="/events" />}>
                        Find an event
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              )}
            </section>

            {/* Hackathons Participated */}
            {participatedEvents && participatedEvents.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <Trophy className="text-muted-foreground size-5" /> Hackathon History
                  <span className="text-muted-foreground text-xs font-normal">
                    ({participatedEvents.length} events)
                  </span>
                </h2>
                <div className="flex flex-col divide-y rounded-xl border">
                  {participatedEvents.map((evt) => (
                    <div
                      key={`${evt.id}-${evt.teamName}`}
                      className="hover:bg-muted/40 flex items-center justify-between p-4 transition-colors"
                    >
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/e/${evt.slug}`}
                          className="hover:text-primary font-semibold text-sm transition-colors"
                        >
                          {evt.name}
                        </Link>
                        {evt.tagline && (
                          <p className="text-muted-foreground line-clamp-1 text-xs">
                            {evt.tagline}
                          </p>
                        )}
                        <p className="text-muted-foreground text-xs">Team: {evt.teamName}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        nativeButton={false}
                        render={<Link href={`/e/${evt.slug}`} />}
                      >
                        View Event
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            {/* Global Standing CTA */}
            <div className="bg-primary/5 flex flex-col gap-2.5 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Trophy className="size-4 text-amber-500" /> Platform Leaderboard
              </div>
              <p className="text-muted-foreground text-xs">
                See where @{u.username} ranks across all Innovation Labs, DZcoin, and distinctions.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1 w-full"
                nativeButton={false}
                render={
                  <Link href={`/leaderboard?highlight=${encodeURIComponent(u.username ?? "")}`} />
                }
              >
                View in Leaderboard
              </Button>
            </div>

            {u.skills.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">Skills & Stack</h2>
                <div className="flex flex-wrap gap-1.5">
                  {u.skills.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {judged.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Gavel className="text-muted-foreground size-4" /> Judging panels
                </h2>
                <ul className="flex flex-col gap-1">
                  {judged.map((j) => (
                    <li key={j.slug}>
                      <Link
                        href={`/e/${j.slug}`}
                        className="hover:bg-muted/60 -mx-2 block rounded-md px-2 py-1.5 text-sm"
                      >
                        {j.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {certificates.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Award className="text-muted-foreground size-4" /> Certificates
                </h2>
                <div className="flex flex-col gap-2">
                  {certificates.map((c) => (
                    <Link
                      key={c.serial}
                      href={`/certificates/${c.serial}`}
                      className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
                    >
                      <span className="bg-warning/20 text-warning-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                        <Award className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.eventName}</p>
                        <p className="text-muted-foreground truncate text-xs capitalize">
                          {c.kind} · {formatDate(c.issuedAt)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!u.skills.length && !judged.length && !certificates.length && (
              <p className="text-muted-foreground text-sm">
                No skills, panels or certificates yet.
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
