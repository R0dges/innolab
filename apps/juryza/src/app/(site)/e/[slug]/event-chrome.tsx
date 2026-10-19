"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CalendarDays, MapPin, Settings2, Users } from "lucide-react";

import { Button } from "@juryza/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { cn } from "@juryza/ui/lib/utils";

import { EventCover, NextMilestone, PhaseBadge } from "@/components/event-bits";
import { formatRange } from "@/lib/format";
import { hasVoting } from "@/lib/phase";
import { useEvent } from "@/lib/queries";

/**
 * Hero + tab navigation for every /e/<slug> page. The event is loaded once via
 * `useEvent(slug)`; child pages call the same hook and share the cache.
 */
export function EventChrome({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { data, isLoading, error } = useEvent(slug);
  const pathname = usePathname();

  if (error) {
    return (
      <Empty className="my-24">
        <EmptyHeader>
          <EmptyTitle>Event not found</EmptyTitle>
          <EmptyDescription>It may have been removed, or it is not published yet.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/events" />}>
            Browse events
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const e = data?.event;
  const base = `/e/${slug}`;
  const tabs = [
    { href: base, label: "Overview", exact: true },
    ...(e?.workflow === "innolab" ? [{ href: `${base}/pitches`, label: "Ideas" }] : []),
    { href: `${base}/projects`, label: "Projects" },
    { href: `${base}/teams`, label: "Teams" },
    ...(e && hasVoting(e) ? [{ href: `${base}/vote`, label: "Vote" }] : []),
    { href: `${base}/leaderboard`, label: "Leaderboard" },
  ];

  return (
    <div className="flex flex-col">
      <EventCover hue={e?.hue ?? 250} className="text-white">
        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
          {isLoading || !e ? (
            <>
              <Skeleton className="h-6 w-40 bg-white/20" />
              <Skeleton className="h-12 w-2/3 bg-white/20" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <PhaseBadge event={e} className="bg-white/15 text-white backdrop-blur" />
                <NextMilestone event={e} className="text-white/80" />
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                {e.name}
              </h1>
              {e.tagline && (
                <p className="max-w-2xl text-lg text-white/85 text-pretty">{e.tagline}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/80">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" />{" "}
                  {formatRange(e.submissionsOpen, e.submissionsClose)}
                </span>
                <span className="flex items-center gap-1.5 capitalize">
                  <MapPin className="size-4" /> {e.location ? `${e.mode} · ${e.location}` : e.mode}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" /> {data.counts.participants} participants ·{" "}
                  {data.counts.projects} projects
                </span>
              </div>
              {data.viewer?.canManage && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  nativeButton={false}
                  render={<Link href={`/manage/${slug}`} />}
                >
                  <Settings2 /> Manage event
                </Button>
              )}
            </>
          )}
        </div>
      </EventCover>
      <div className="bg-background/90 sticky top-16 z-30 border-b backdrop-blur">
        <nav
          className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6"
          aria-label="Event sections"
        >
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "text-muted-foreground hover:text-foreground border-b-2 border-transparent px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active && "border-primary text-foreground"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}
