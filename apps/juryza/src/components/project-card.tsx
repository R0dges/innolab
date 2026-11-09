"use client";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Minus, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card } from "@juryza/ui/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@juryza/ui/components/ui/tooltip";
import { cn } from "@juryza/ui/lib/utils";

import { coverStyle } from "@/components/event-bits";
import { api } from "@/lib/api";
import { hueOf, initials } from "@/lib/format";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { voteCost } from "@/lib/voting";

/**
 * The gallery card for one submitted project: cover (thumbnail or a generated
 * gradient with the project's initials), title, tagline, track, tech tags,
 * team and comment count. In `selectable` mode the card toggles selection
 * (for the comparison tray) instead of navigating.
 *
 * Also home to the community-vote pieces shared by the ballot and the project
 * page: the ballot query, an optimistic vote mutation and the +/- stepper.
 */

/** One row of GET /api/events/:slug/projects. */
export interface GalleryProject {
  id: string;
  title: string;
  tagline: string | null;
  thumbnailUrl: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  videoUrl: string | null;
  techTags: string[];
  trackId: string | null;
  trackName: string | null;
  teamId: string | null;
  teamName: string | null;
  submittedAt: string | null;
  comments: number;
}

/** GET /api/events/:slug/projects. */
export interface GalleryResponse {
  event: { id: string; slug: string; name: string };
  count: number;
  projects: GalleryProject[];
}

type CardProject = Pick<
  GalleryProject,
  "id" | "title" | "tagline" | "thumbnailUrl" | "techTags" | "trackName"
> &
  Partial<Pick<GalleryProject, "teamName" | "comments">>;

/** Cover art for a project — its thumbnail, or a stable gradient with initials. */
export function ProjectCover({
  project,
  className,
  size = "md",
}: {
  project: Pick<GalleryProject, "id" | "title" | "thumbnailUrl">;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (project.thumbnailUrl) {
    return (
      <div className={cn("bg-muted relative overflow-hidden", className)}>
        {/* biome-ignore lint/performance/noImgElement: arbitrary user-supplied hosts, not next/image-configured */}
        <img
          src={project.thumbnailUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={cn("relative grid place-items-center overflow-hidden text-white", className)}
      style={coverStyle(hueOf(project.id))}
      aria-hidden
    >
      <span
        className={cn(
          "font-semibold tracking-tight opacity-90 drop-shadow-sm",
          size === "sm" && "text-sm",
          size === "md" && "text-3xl",
          size === "lg" && "text-5xl"
        )}
      >
        {initials(project.title)}
      </span>
    </div>
  );
}

export function TagChips({
  tags,
  max = 3,
  className,
}: {
  tags: string[];
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((t) => (
        <Badge key={t} variant="outline" className="text-muted-foreground font-normal">
          {t}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge
          variant="outline"
          className="text-muted-foreground font-normal"
          title={tags.slice(max).join(", ")}
        >
          +{rest}
        </Badge>
      )}
    </div>
  );
}

export function ProjectCard({
  project,
  href,
  selectable = false,
  selected = false,
  disabled = false,
  onToggle,
  target,
  className,
}: {
  project: CardProject;
  href: string;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: (id: string) => void;
  target?: "_blank";
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        "h-full gap-0 overflow-hidden py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md",
        selected && "ring-primary ring-2",
        className
      )}
    >
      <div className="relative">
        <ProjectCover project={project} className="aspect-[16/9] w-full" />
        {EVENT_TRACKS_ENABLED && project.trackName && (
          <Badge
            variant="secondary"
            className="bg-background/85 absolute top-2.5 left-2.5 backdrop-blur"
          >
            {project.trackName}
          </Badge>
        )}
        {selectable && (
          <span
            className={cn(
              "bg-background/85 absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-md border backdrop-blur transition-colors",
              selected && "border-primary bg-primary text-primary-foreground"
            )}
            aria-hidden
          >
            {selected && <Check className="size-4" />}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-semibold tracking-tight">{project.title}</h3>
        <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm text-pretty">
          {project.tagline || "No tagline yet."}
        </p>
        <TagChips tags={project.techTags} />
        {(project.teamName !== undefined || project.comments !== undefined) && (
          <div className="text-muted-foreground mt-auto flex items-center justify-between gap-2 pt-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <UsersRound className="size-3.5 shrink-0" />
              <span className="truncate">{project.teamName ?? "Solo"}</span>
            </span>
            {project.comments !== undefined && (
              <span
                className="flex shrink-0 items-center gap-1"
                title={`${project.comments} comments`}
              >
                <MessageSquare className="size-3.5" />
                <span className="tabular-nums">{project.comments}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );

  if (selectable) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${selected ? "Deselect" : "Select"} ${project.title} for comparison`}
        disabled={disabled && !selected}
        onClick={() => onToggle?.(project.id)}
        className="group focus-visible:ring-ring/50 rounded-xl text-left outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      href={href}
      target={target}
      rel={target ? "noopener" : undefined}
      className="group focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3"
    >
      {body}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Community voting (shared by /vote and the project page)            */
/* ------------------------------------------------------------------ */

export interface BallotProject {
  id: string;
  title: string;
  tagline: string | null;
  thumbnailUrl: string | null;
  trackName: string | null;
  techTags: string[];
  ownTeam: boolean;
  myVotes: number;
}

/** GET /api/events/:slug/ballot. */
export interface Ballot {
  event: {
    id: string;
    slug: string;
    name: string;
    votingOpen: string | null;
    votingClose: string | null;
  };
  enabled: boolean;
  open: boolean;
  access: "open" | "email" | "authenticated" | (string & {});
  allowedDomains: string[];
  voter: { status: "ready"; label: string } | { status: "sign-in" } | { status: "verify-email" };
  budget: number;
  spent: number;
  maxVotesPerProject: number;
  projects: BallotProject[];
}

export const ballotKey = (slug: string) => ["ballot", slug] as const;

export function useBallot(slug: string, enabled = true) {
  return useQuery({
    queryKey: ballotKey(slug),
    queryFn: () => api.get<Ballot>(`/api/events/${slug}/ballot`),
    enabled,
  });
}

/**
 * Set this voter's votes on one project. Optimistic: the ballot cache updates
 * at once and rolls back if the server refuses (budget, window, own team).
 * The server is the authority on every rule.
 */
export function useCastVote(slug: string) {
  const qc = useQueryClient();
  const key = ballotKey(slug);
  return useMutation({
    mutationFn: (v: { projectId: string; votes: number }) =>
      api.post<{ ok: true; votes: number; spent: number; remaining: number }>(
        `/api/events/${slug}/votes`,
        v
      ),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Ballot>(key);
      if (previous) {
        const projects = previous.projects.map((p) =>
          p.id === v.projectId ? { ...p, myVotes: v.votes } : p
        );
        qc.setQueryData<Ballot>(key, {
          ...previous,
          projects,
          spent: projects.reduce((n, p) => n + voteCost(p.myVotes), 0),
        });
      }
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(e.message);
    },
    onSuccess: (r) => {
      const current = qc.getQueryData<Ballot>(key);
      if (current) qc.setQueryData<Ballot>(key, { ...current, spent: r.spent });
    },
  });
}

/** − n + control for one project's votes, with the quadratic cost beside it. */
export function VoteStepper({
  title,
  votes,
  max,
  remaining,
  disabled = false,
  disabledReason,
  onChange,
  className,
}: {
  title: string;
  votes: number;
  max: number;
  /** Credits left in the budget, not counting this project's current votes. */
  remaining: number;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (votes: number) => void;
  className?: string;
}) {
  const nextCost = voteCost(votes + 1);
  const canAdd = !disabled && votes < max && nextCost <= remaining;
  const control = (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="bg-background flex items-center rounded-lg border">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove a vote from ${title}`}
          disabled={disabled || votes === 0}
          onClick={() => onChange(votes - 1)}
        >
          <Minus />
        </Button>
        <output
          className="w-8 text-center text-sm font-semibold tabular-nums"
          aria-label={`${votes} votes for ${title}`}
        >
          {votes}
        </output>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Add a vote to ${title}`}
          disabled={!canAdd}
          onClick={() => onChange(votes + 1)}
        >
          <Plus />
        </Button>
      </div>
      <div className="text-muted-foreground w-24 text-xs leading-tight tabular-nums">
        <div>
          costs <span className="text-foreground font-medium">{voteCost(votes)}</span> cr
        </div>
        {!disabled && votes < max && (
          <div className={cn(!canAdd && "opacity-60")}>next +{nextCost - voteCost(votes)} cr</div>
        )}
      </div>
    </div>
  );
  if (!disabled || !disabledReason) return control;
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>{control}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
