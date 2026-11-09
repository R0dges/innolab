"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  CalendarDays,
  Coins,
  Compass,
  GitBranch,
  Medal,
  Search,
  Sparkles,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card } from "@juryza/ui/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@juryza/ui/components/ui/tabs";

import { UserAvatar } from "@/components/user-avatar";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";

interface LeaderboardEntry {
  personId: string;
  name: string;
  username: string;
  email: string;
  image: string;
  githubUrl: string | null;
  points: number;
  prizeUsd: number;
  awardsCount: number;
  eventsCount: number;
  wins?: {
    first: number;
    second: number;
    third: number;
    category: number;
    special: number;
    side_quest: number;
    honourable_mention: number;
  };
  headline: string;
  bio: string;
  skills: string[];
  rank: number;
}

interface LeaderboardData {
  totals: {
    events_scored: number;
    events_total: number;
    people: number;
    awards: number;
    prize_usd_awarded: number;
    repeat_winners: number;
    latest_event: string;
  };
  leaderboard: LeaderboardEntry[];
}

type SortKey = "rank" | "name" | "points" | "prize" | "events" | "awards";
type SortDirection = "asc" | "desc";

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<LeaderboardSkeleton />}>
      <LeaderboardContent />
    </Suspense>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDirection }) {
  if (!active) {
    return (
      <ArrowUpDown className="size-3 text-muted-foreground/30 hover:text-muted-foreground transition-colors" />
    );
  }
  return dir === "asc" ? (
    <ArrowUp className="size-3 text-primary stroke-[2.5]" />
  ) : (
    <ArrowDown className="size-3 text-primary stroke-[2.5]" />
  );
}

function LeaderboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightParam = searchParams.get("highlight") || searchParams.get("user") || "";

  const [q, setQ] = useState(highlightParam);
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [highlight, setHighlight] = useState(highlightParam);

  const viewer = useViewer();

  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => api.get<LeaderboardData>("/api/leaderboard"),
  });

  // Find currently logged-in user entry in the leaderboard, OR dynamically construct their standing!
  // It doesn't matter whether a logged-in user has pre-existing leaderboard points or not;
  // gamification means they ALWAYS see their personal standing and presence.
  const viewerEntry: LeaderboardEntry | null = useMemo(() => {
    if (!viewer) return null;
    const vUser = (viewer.username || "").toLowerCase();
    const vEmail = (viewer.email || "").toLowerCase();

    // 1. If present in the loaded leaderboard:
    if (data?.leaderboard) {
      const match = data.leaderboard.find(
        (p) =>
          (vUser && p.username.toLowerCase() === vUser) ||
          (vEmail && p.email.toLowerCase() === vEmail)
      );
      if (match) return match;
    }

    // 2. If not found in leaderboard data yet (e.g. newly registered or 0 points), ALWAYS construct their standing!
    const totalCount = data?.leaderboard.length ?? 93;
    const fallbackUsername =
      viewer.username ||
      (viewer.email ? viewer.email.split("@")[0] : null)?.replace(/[^a-zA-Z0-9_-]/g, "") ||
      "builder";

    return {
      personId: viewer.userId,
      name: viewer.name || "You",
      username: fallbackUsername,
      email: viewer.email,
      image:
        viewer.image ||
        `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(fallbackUsername)}`,
      githubUrl: viewer.username ? `https://github.com/${viewer.username}` : null,
      points: 0,
      prizeUsd: 0,
      awardsCount: 0,
      eventsCount: 0,
      headline: "Aspiring Builder · Ready to compete",
      bio: "Joined Juryza to compete in hackathons and climb the global rankings.",
      skills: [],
      rank: totalCount + 1,
    };
  }, [viewer, data]);

  // Find highlighted person if present in query
  const highlightedEntry = useMemo(() => {
    if (!highlight || !data?.leaderboard) return null;
    const hl = highlight.toLowerCase();
    return data.leaderboard.find(
      (p) => p.username.toLowerCase() === hl || p.personId.toLowerCase() === hl
    );
  }, [highlight, data]);

  const handleHeaderSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" || key === "name" ? "asc" : "desc");
    }
  };

  const sortedList = useMemo(() => {
    const list = [...(data?.leaderboard ?? [])];

    // Ensure the logged-in user is ALWAYS in the leaderboard table!
    if (
      viewerEntry &&
      !list.some(
        (p) =>
          (viewerEntry.username &&
            p.username.toLowerCase() === viewerEntry.username.toLowerCase()) ||
          (viewerEntry.email && p.email.toLowerCase() === viewerEntry.email.toLowerCase())
      )
    ) {
      list.push(viewerEntry);
    }

    const mult = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      if (sortKey === "name") {
        return mult * a.name.localeCompare(b.name);
      }
      if (sortKey === "rank") {
        return mult * (a.rank - b.rank);
      }
      if (sortKey === "prize") {
        const diff = a.prizeUsd - b.prizeUsd;
        return diff !== 0 ? mult * diff : mult * (a.points - b.points);
      }
      if (sortKey === "awards") {
        const diff = a.awardsCount - b.awardsCount;
        return diff !== 0 ? mult * diff : mult * (a.points - b.points);
      }
      if (sortKey === "events") {
        const diff = a.eventsCount - b.eventsCount;
        return diff !== 0 ? mult * diff : mult * (a.points - b.points);
      }
      // default points
      const diff = a.points - b.points;
      return diff !== 0 ? mult * diff : mult * (a.prizeUsd - b.prizeUsd);
    });

    return list;
  }, [data, sortKey, sortDir, viewerEntry]);

  const filteredList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sortedList;
    return sortedList.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.username.toLowerCase().includes(needle) ||
        p.headline.toLowerCase().includes(needle) ||
        p.skills.some((s) => s.toLowerCase().includes(needle))
    );
  }, [sortedList, q]);

  const top3 = useMemo(() => (data?.leaderboard ?? []).slice(0, 3), [data]);

  const clearHighlight = () => {
    setHighlight("");
    setQ("");
    router.replace("/leaderboard", { scroll: false });
  };

  return (
    <div className="flex flex-col">
      {/* Header Banner */}
      <section className="bg-muted/30 border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                <Trophy className="size-3.5" /> Global Platform Rankings
              </span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-muted-foreground text-xs font-medium">
                Hackathon Raptors All-Time
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Centralized Leaderboard
            </h1>
            <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
              Official rankings and lifetime awards across 30+ engineering hackathons. Real
              builders, real scores, and verified GitHub achievements.
            </p>
          </div>

          {/* KPI Stats Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="bg-background/80 gap-0 p-4 backdrop-blur">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Coins className="size-4 text-emerald-500" /> Total DZcoin
                </span>
                <span className="text-2xl font-bold tracking-tight text-emerald-600 tabular-nums dark:text-emerald-400 sm:text-3xl">
                  {(data?.totals.prize_usd_awarded ?? 51100).toLocaleString()} DZcoin
                </span>
              </div>
            </Card>

            <Card className="bg-background/80 gap-0 p-4 backdrop-blur">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <UsersRound className="size-4 text-sky-500" /> Ranked Builders
                </span>
                <span className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {data?.totals.people ?? 93}
                </span>
              </div>
            </Card>

            <Card className="bg-background/80 gap-0 p-4 backdrop-blur">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Award className="size-4 text-amber-500" /> Awards Granted
                </span>
                <span className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {data?.totals.awards ?? 125}
                </span>
              </div>
            </Card>

            <Card className="bg-background/80 gap-0 p-4 backdrop-blur">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <CalendarDays className="size-4 text-purple-500" /> Scored Events
                </span>
                <span className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                  {data?.totals.events_scored ?? 32}
                </span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load leaderboard</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholder
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : (
          <>
            {/* LOGGED-IN PARTICIPANT STANDING CARD */}
            {viewerEntry && (
              <Card className="border-primary/40 bg-gradient-to-r from-primary/10 via-background to-primary/5 p-4 sm:p-5 shadow-xs">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <UserAvatar
                        name={viewerEntry.name}
                        image={viewerEntry.image}
                        className="size-12 ring-2 ring-primary"
                      />
                      <span className="bg-primary text-primary-foreground absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full text-[0.65rem] font-black shadow-xs">
                        #{viewerEntry.rank}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{viewerEntry.name}</span>
                        <Badge className="bg-primary text-primary-foreground text-[0.65rem] px-1.5 py-0">
                          You
                        </Badge>
                        {viewerEntry.points === 0 && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[0.65rem] px-1.5 py-0"
                          >
                            New Contender
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs font-mono">
                        @{viewerEntry.username} · Ranked #{viewerEntry.rank} Overall
                      </span>
                      {viewerEntry.points === 0 && (
                        <span className="text-muted-foreground text-[0.7rem] font-medium mt-0.5">
                          🚀 Submit hackathon projects to earn points and climb the ranks!
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 divide-x divide-border/60 text-center sm:gap-4">
                    <div className="px-2">
                      <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
                        Rank
                      </span>
                      <span className="text-base sm:text-xl font-bold text-amber-500">
                        #{viewerEntry.rank}
                      </span>
                    </div>
                    <div className="px-2">
                      <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
                        Points
                      </span>
                      <span className="text-base sm:text-xl font-bold tabular-nums">
                        {viewerEntry.points}
                      </span>
                    </div>
                    <div className="px-2">
                      <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
                        DZcoin
                      </span>
                      <span className="text-base sm:text-xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                        {viewerEntry.prizeUsd.toLocaleString()} DZcoin
                      </span>
                    </div>
                    <div className="px-2">
                      <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
                        Awards
                      </span>
                      <span className="text-base sm:text-xl font-bold tabular-nums">
                        {viewerEntry.awardsCount}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setQ(viewerEntry.username)}
                      className="text-xs"
                    >
                      Locate in Table
                    </Button>
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link
                          href={viewerEntry.points > 0 ? `/u/${viewerEntry.username}` : "/events"}
                        />
                      }
                      className="text-xs"
                    >
                      {viewerEntry.points > 0 ? "View My Profile" : "Join Hackathon"}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* HIGHLIGHTED BUILDER ACTIVE FILTER BANNER */}
            {highlight && highlightedEntry && (
              <div className="bg-amber-500/10 border-amber-500/30 flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="size-4.5 text-amber-500 shrink-0" />
                  <span>
                    Viewing standing for <strong>{highlightedEntry.name}</strong> (
                    <span className="font-mono">@{highlightedEntry.username}</span>): Ranked{" "}
                    <strong>#{highlightedEntry.rank}</strong> with{" "}
                    <strong>{highlightedEntry.points} pts</strong> across{" "}
                    <strong>{highlightedEntry.eventsCount} hackathons</strong>.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearHighlight}
                  className="h-8 gap-1 text-xs shrink-0"
                >
                  <X className="size-3.5" /> Show All Builders
                </Button>
              </div>
            )}

            {/* TOP 3 PODIUM SPOTLIGHT */}
            {!q.trim() && !highlight && top3.length >= 3 && (
              <section className="flex flex-col gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  <Medal className="size-5 text-amber-500" /> Podium Champions
                </h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* 2nd Place */}
                  {top3[1] && <PodiumCard person={top3[1]} place={2} />}
                  {/* 1st Place */}
                  {top3[0] && <PodiumCard person={top3[0]} place={1} />}
                  {/* 3rd Place */}
                  {top3[2] && <PodiumCard person={top3[2]} place={3} />}
                </div>
              </section>
            )}

            {/* LEADERBOARD TABLE & SEARCH */}
            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <InputGroup className="bg-background h-10 w-full sm:max-w-md">
                  <InputGroupAddon>
                    <Search className="size-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by builder name, @handle, skill…"
                    aria-label="Search leaderboard"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="text-muted-foreground hover:text-foreground pr-2"
                      title="Clear search"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </InputGroup>

                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground hidden text-xs font-medium sm:inline">
                    Sort by:
                  </span>
                  <Tabs
                    value={["points", "prize", "awards", "events"].includes(sortKey) ? sortKey : ""}
                    onValueChange={(v) => {
                      if (v) {
                        setSortKey(v as SortKey);
                        setSortDir("desc");
                      }
                    }}
                  >
                    <TabsList>
                      <TabsTrigger value="points">Points</TabsTrigger>
                      <TabsTrigger value="prize">DZcoin</TabsTrigger>
                      <TabsTrigger value="awards">Awards</TabsTrigger>
                      <TabsTrigger value="events">Events</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              {filteredList.length === 0 ? (
                <Empty className="border py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Compass />
                    </EmptyMedia>
                    <EmptyTitle>No builders found</EmptyTitle>
                    <EmptyDescription>
                      Try searching with a different name or GitHub handle.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQ("");
                        setHighlight("");
                      }}
                    >
                      Clear search & filters
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="bg-background overflow-hidden rounded-xl border shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50 text-muted-foreground border-b text-xs font-semibold uppercase">
                        <tr>
                          <th className="w-20 px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleHeaderSort("rank")}
                              className="inline-flex items-center gap-1.5 hover:text-foreground font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                              title="Sort by Rank"
                            >
                              Rank
                              <SortIndicator active={sortKey === "rank"} dir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => handleHeaderSort("name")}
                              className="inline-flex items-center gap-1.5 hover:text-foreground font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                              title="Sort by Builder Name"
                            >
                              Builder
                              <SortIndicator active={sortKey === "name"} dir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3.5 text-right">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleHeaderSort("points")}
                                className="inline-flex items-center gap-1.5 hover:text-foreground font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                                title="Sort by Points"
                              >
                                Points
                                <SortIndicator active={sortKey === "points"} dir={sortDir} />
                              </button>
                            </div>
                          </th>
                          <th className="px-4 py-3.5 text-right">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleHeaderSort("prize")}
                                className="inline-flex items-center gap-1.5 hover:text-foreground font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                                title="Sort by DZcoin"
                              >
                                DZcoin
                                <SortIndicator active={sortKey === "prize"} dir={sortDir} />
                              </button>
                            </div>
                          </th>
                          <th className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleHeaderSort("events")}
                              className="inline-flex items-center gap-1.5 hover:text-foreground font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                              title="Sort by Hackathons Count"
                            >
                              Hackathons
                              <SortIndicator active={sortKey === "events"} dir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleHeaderSort("awards")}
                              className="inline-flex items-center gap-1.5 hover:text-foreground font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                              title="Sort by Awards Count"
                            >
                              Awards
                              <SortIndicator active={sortKey === "awards"} dir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3.5 text-right">Profile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredList.map((p, idx) => {
                          const displayRank =
                            sortKey === "points" && sortDir === "desc" ? p.rank : idx + 1;
                          const isCurrentUser = Boolean(
                            viewer &&
                              ((viewer.username &&
                                p.username.toLowerCase() === viewer.username.toLowerCase()) ||
                                (viewer.email &&
                                  p.email.toLowerCase() === viewer.email.toLowerCase()))
                          );
                          const isHighlighted = Boolean(
                            highlight &&
                              (p.username.toLowerCase() === highlight.toLowerCase() ||
                                p.personId.toLowerCase() === highlight.toLowerCase())
                          );

                          return (
                            <tr
                              key={p.personId}
                              className={`transition-colors ${
                                isHighlighted
                                  ? "bg-amber-500/10 dark:bg-amber-500/15 font-medium ring-1 ring-amber-500/40"
                                  : isCurrentUser
                                    ? "bg-primary/5 font-medium"
                                    : "hover:bg-muted/40"
                              }`}
                            >
                              <td className="px-4 py-4 text-center">
                                <span
                                  className={`inline-grid size-7 place-items-center rounded-full text-xs font-bold ${
                                    displayRank === 1
                                      ? "bg-amber-500 text-slate-950 shadow-sm"
                                      : displayRank === 2
                                        ? "bg-slate-300 text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                                        : displayRank === 3
                                          ? "bg-amber-700 text-white shadow-sm"
                                          : "text-muted-foreground font-semibold"
                                  }`}
                                >
                                  {displayRank}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    name={p.name}
                                    image={p.image}
                                    className="size-9 ring-1 ring-border"
                                  />
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <Link
                                        href={`/u/${p.username}`}
                                        className="hover:text-primary font-semibold transition-colors"
                                      >
                                        {p.name}
                                      </Link>
                                      {isCurrentUser && (
                                        <Badge className="bg-primary/20 text-primary px-1.5 py-0 text-[0.65rem]">
                                          You
                                        </Badge>
                                      )}
                                      {isHighlighted && (
                                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0 text-[0.65rem]">
                                          Focused
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                                      <span className="font-mono">@{p.username}</span>
                                      {sortKey !== "rank" && (
                                        <span className="text-muted-foreground/60 text-[0.7rem]">
                                          (Rank #{p.rank})
                                        </span>
                                      )}
                                      {p.githubUrl && (
                                        <a
                                          href={p.githubUrl}
                                          target="_blank"
                                          rel="noopener noreferrer nofollow"
                                          className="hover:text-foreground inline-flex items-center gap-0.5"
                                        >
                                          <GitBranch className="size-3" /> GitHub
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right font-bold tabular-nums">
                                {p.points}{" "}
                                <span className="text-muted-foreground text-xs font-normal">
                                  pts
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                                {p.prizeUsd > 0 ? `${p.prizeUsd.toLocaleString()} DZcoin` : "—"}
                              </td>
                              <td className="px-4 py-4 text-center tabular-nums">
                                {p.eventsCount}
                              </td>
                              <td className="px-4 py-4 text-center">
                                <Badge variant="secondary" className="font-mono text-xs">
                                  {p.awardsCount} won
                                </Badge>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  nativeButton={false}
                                  render={<Link href={`/u/${p.username}`} />}
                                  className="h-8 text-xs font-medium"
                                >
                                  View →
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function PodiumCard({ person, place }: { person: LeaderboardEntry; place: 1 | 2 | 3 }) {
  const isFirst = place === 1;
  const medalColor =
    place === 1
      ? "from-amber-500/20 to-amber-500/5 border-amber-500/40 text-amber-500"
      : place === 2
        ? "from-slate-400/20 to-slate-400/5 border-slate-400/40 text-slate-400"
        : "from-amber-700/20 to-amber-700/5 border-amber-700/40 text-amber-600";

  // First place wins count or awards
  const winHeadline = person.wins?.first
    ? `${person.wins.first}x 1st Place`
    : `${person.awardsCount} Awards`;

  return (
    <Card
      className={`relative overflow-hidden bg-gradient-to-b p-5 ${medalColor} ${
        isFirst ? "sm:-translate-y-2 sm:shadow-lg" : ""
      }`}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <UserAvatar
            name={person.name}
            image={person.image}
            className={`ring-4 ${
              isFirst ? "size-20 ring-amber-500 sm:size-24" : "size-16 ring-border sm:size-18"
            }`}
          />
          <span
            className={`absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full text-xs font-black shadow-md ${
              place === 1
                ? "bg-amber-500 text-slate-950"
                : place === 2
                  ? "bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-white"
                  : "bg-amber-800 text-white"
            }`}
          >
            #{place}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <Link
            href={`/u/${person.username}`}
            className="hover:underline font-bold text-base sm:text-lg tracking-tight"
          >
            {person.name}
          </Link>
          <span className="text-muted-foreground text-xs font-mono">@{person.username}</span>
        </div>

        {/* 2x2 Stats Grid: Shows total wins, prizes, score, and hackathons */}
        <div className="bg-background/80 mt-1 grid w-full grid-cols-2 gap-2 rounded-lg border p-2.5 text-center text-xs backdrop-blur">
          <div>
            <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
              Score
            </span>
            <span className="font-bold text-sm tabular-nums">{person.points} pts</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
              DZcoin
            </span>
            <span className="font-bold text-emerald-600 text-sm tabular-nums dark:text-emerald-400">
              {person.prizeUsd.toLocaleString()} DZcoin
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
              Hackathons
            </span>
            <span className="font-bold text-sm tabular-nums">{person.eventsCount} events</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[0.7rem] uppercase font-semibold">
              Wins
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400 text-sm tabular-nums">
              {winHeadline}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="mt-1 w-full text-xs"
          nativeButton={false}
          render={<Link href={`/u/${person.username}`} />}
        >
          View Full Profile
        </Button>
      </div>
    </Card>
  );
}
