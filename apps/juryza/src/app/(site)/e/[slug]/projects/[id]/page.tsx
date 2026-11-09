"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  CalendarDays,
  Code2,
  ExternalLink,
  GitCompareArrows,
  MessageSquare,
  PencilLine,
  PlayCircle,
  Trash2,
  Trophy,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Separator } from "@juryza/ui/components/ui/separator";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Textarea } from "@juryza/ui/components/ui/textarea";

import { RichContent } from "@/components/editor/rich-content";
import {
  ProjectCover,
  TagChips,
  useBallot,
  useCastVote,
  VoteStepper,
} from "@/components/project-card";
import { UserAvatar } from "@/components/user-avatar";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { formatDate, formatNumber, relativeTime } from "@/lib/format";
import { votingIsOpen } from "@/lib/phase";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { useEvent } from "@/lib/queries";
import type { EventResults } from "@/lib/server/results";
import type { Json, Project, Track } from "@/lib/types";
import { voteCost } from "@/lib/voting";

/**
 * A project's public page: cover and links, video, the write-up, the team,
 * published results, a community-vote control while voting runs, similar
 * projects, and the discussion thread.
 */

interface ProjectResponse {
  project: Json<Project>;
  event: { id: string; slug: string; name: string; submissionsClose: string; hue: number };
  track: Json<Track> | null;
  team: {
    id: string;
    name: string;
    members: {
      id: string;
      name: string;
      username: string | null;
      image: string | null;
      headline: string | null;
      role: string;
    }[];
  } | null;
  viewer: {
    manager: boolean;
    member: boolean;
    owner: boolean;
    canEdit: boolean;
    submissionsOpen: boolean;
  };
}

type ResultsResponse =
  | { published: false }
  | ({ published: boolean; preview: boolean } & Json<EventResults>);

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorUsername: string | null;
  authorImage: string | null;
}

interface SimilarRow {
  id: string;
  title: string;
  tagline: string | null;
  techTags: string[];
  thumbnailUrl: string | null;
  trackName: string | null;
  score: number;
}

/** A safe embed URL built only from a parsed video id — never the raw link. */
function videoEmbed(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const yt = /^[A-Za-z0-9_-]{11}$/;
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
  }
  if (id && yt.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const v = u.pathname.match(/(\d{6,12})/)?.[1];
    if (v) return `https://player.vimeo.com/video/${v}`;
  }
  return null;
}

export default function ProjectPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { data: ev } = useEvent(slug);
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<ProjectResponse>(`/api/projects/${id}`),
  });

  if (error) {
    return (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyTitle>Project not found</EmptyTitle>
          <EmptyDescription>
            It may have been withdrawn, or it hasn't been submitted yet.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/e/${slug}/projects`} />}
          >
            <ArrowLeft /> Back to the gallery
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (isLoading || !data) return <DetailSkeleton />;

  const p = data.project;
  const embed = videoEmbed(p.videoUrl);
  const links = [
    p.liveUrl && { href: p.liveUrl, label: "Live demo", icon: ExternalLink, primary: true },
    p.repoUrl && { href: p.repoUrl, label: "Source code", icon: Code2, primary: false },
    p.videoUrl &&
      !embed && { href: p.videoUrl, label: "Watch video", icon: PlayCircle, primary: false },
  ].filter((l) => !!l);
  const voting = ev ? votingIsOpen(ev.event) : false;
  const submitted = p.status === "submitted";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/e/${slug}/projects`} />}
        >
          <ArrowLeft /> All projects
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {data.viewer.canEdit && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${p.id}`} />}
            >
              <PencilLine /> Edit project
            </Button>
          )}
          {submitted && (
            <Button
              size="sm"
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/e/${slug}/compare?ids=${p.id}`} />}
            >
              <GitCompareArrows /> Compare with similar
            </Button>
          )}
        </div>
      </div>

      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <ProjectCover project={p} size="lg" className="aspect-[3/1] w-full rounded-2xl" />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {EVENT_TRACKS_ENABLED && data.track && (
                <Badge variant="secondary">{data.track.name}</Badge>
              )}
              {!submitted && <Badge variant="outline">Draft</Badge>}
              {p.submittedAt && (
                <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <CalendarDays className="size-3.5" /> Submitted {formatDate(p.submittedAt)}
                </span>
              )}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {p.title}
            </h2>
            {p.tagline && (
              <p className="text-muted-foreground max-w-3xl text-lg text-pretty">{p.tagline}</p>
            )}
            <TagChips tags={p.techTags} max={12} />
          </div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((l) => (
                <Button
                  key={l.label}
                  variant={l.primary ? "default" : "outline"}
                  nativeButton={false}
                  render={<a href={l.href} target="_blank" rel="noopener noreferrer nofollow" />}
                >
                  <l.icon /> {l.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <ResultsCard slug={slug} projectId={p.id} />
          {voting && submitted && <VoteCard slug={slug} projectId={p.id} />}
          <TeamCard team={data.team} />
        </aside>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          {embed && (
            <div className="bg-muted aspect-video overflow-hidden rounded-xl border">
              <iframe
                src={embed}
                title={`${p.title} demo video`}
                className="size-full"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                loading="lazy"
              />
            </div>
          )}
          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold tracking-tight">About the project</h3>
            <RichContent
              doc={p.content}
              empty={
                <p className="text-muted-foreground text-sm">
                  {p.description || "The team hasn't written anything yet."}
                </p>
              }
            />
          </section>
          <Separator />
          {submitted && <Comments projectId={p.id} canModerate={ev?.viewer?.canManage ?? false} />}
        </div>
        <aside className="flex flex-col gap-4">
          {submitted && <SimilarList slug={slug} projectId={p.id} />}
        </aside>
      </div>
    </div>
  );
}

function ResultsCard({ slug, projectId }: { slug: string; projectId: string }) {
  const { data } = useQuery({
    queryKey: ["results", slug],
    queryFn: () => api.get<ResultsResponse>(`/api/events/${slug}/results`),
  });
  if (!data?.published || !("projects" in data)) return null;
  const r = data.projects.find((x) => x.id === projectId);
  if (!r || r.rank === null) return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Trophy className="size-3.5" /> Final results
        </CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-3xl">
          #{r.rank}
          <span className="text-muted-foreground text-sm font-normal">
            of {data.totals.submitted}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Normalized score</dt>
            <dd className="font-semibold tabular-nums">{formatNumber(r.normalized, 2)} / 5</dd>
          </div>
          {EVENT_TRACKS_ENABLED && (
            <div>
              <dt className="text-muted-foreground text-xs">Track rank</dt>
              <dd className="font-semibold tabular-nums">
                {r.trackRank ? `#${r.trackRank}` : "—"}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground text-xs">Reviews</dt>
            <dd className="font-semibold tabular-nums">{r.reviews}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Community votes</dt>
            <dd className="font-semibold tabular-nums">{r.votes}</dd>
          </div>
        </dl>
        {r.awards.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.awards.map((a) => (
              <Badge key={a.prizeId} className="gap-1">
                <Award /> {a.name}
                {a.amount ? ` · ${a.amount}` : ""}
              </Badge>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/e/${slug}/leaderboard`} />}
        >
          Full leaderboard
        </Button>
      </CardContent>
    </Card>
  );
}

function VoteCard({ slug, projectId }: { slug: string; projectId: string }) {
  const { data: ballot } = useBallot(slug);
  const cast = useCastVote(slug);
  const pathname = usePathname();
  if (!ballot?.open) return null;
  const mine = ballot.projects.find((x) => x.id === projectId);

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Vote className="size-4" /> Community vote
        </CardTitle>
        <CardDescription>
          Quadratic voting: n votes cost n² credits from your {ballot.budget}-credit budget.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ballot.voter.status === "ready" && mine ? (
          <>
            <VoteStepper
              title={mine.title}
              votes={mine.myVotes}
              max={ballot.maxVotesPerProject}
              remaining={ballot.budget - ballot.spent + voteCost(mine.myVotes)}
              disabled={mine.ownTeam || cast.isPending}
              disabledReason={
                mine.ownTeam ? "You can't vote for your own team's project" : undefined
              }
              onChange={(votes) => cast.mutate({ projectId, votes })}
            />
            <p className="text-muted-foreground text-xs tabular-nums">
              {ballot.spent} of {ballot.budget} credits spent across the event.
            </p>
          </>
        ) : ballot.voter.status === "sign-in" ? (
          <Button
            nativeButton={false}
            render={<Link href={`/login?next=${encodeURIComponent(pathname)}`} />}
          >
            Sign in to vote
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Verify your email on the ballot to start voting.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/e/${slug}/vote`} />}
        >
          Open the full ballot
        </Button>
      </CardContent>
    </Card>
  );
}

function TeamCard({ team }: { team: ProjectResponse["team"] }) {
  if (!team) return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription>Built by</CardDescription>
        <CardTitle className="text-base">{team.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {team.members.map((m) => {
            const inner = (
              <>
                <UserAvatar name={m.name} image={m.image} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {m.headline ?? (m.username ? `@${m.username}` : "")}
                  </span>
                </span>
                {m.role === "owner" && (
                  <Badge variant="outline" className="ml-auto">
                    Lead
                  </Badge>
                )}
              </>
            );
            return (
              <li key={m.id}>
                {m.username ? (
                  <Link
                    href={`/u/${m.username}`}
                    className="hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="-mx-2 flex items-center gap-3 px-2 py-1.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function SimilarList({ slug, projectId }: { slug: string; projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["similar", projectId],
    queryFn: () => api.get<{ similar: SimilarRow[] }>(`/api/projects/${projectId}/similar`),
  });
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">Similar projects</CardTitle>
        <CardDescription>By content and tags.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading ? (
          Array.from({ length: 3 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-12 w-full" />
          ))
        ) : !data?.similar.length ? (
          <p className="text-muted-foreground text-sm">Nothing close enough yet.</p>
        ) : (
          data.similar.map((s) => (
            <Link
              key={s.id}
              href={`/e/${slug}/projects/${s.id}`}
              className="hover:bg-muted -mx-2 flex items-center gap-3 rounded-lg px-2 py-2"
            >
              <ProjectCover project={s} size="sm" className="size-10 shrink-0 rounded-lg" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{s.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {s.trackName ?? s.tagline ?? ""}
                </span>
              </span>
              <span
                className="text-muted-foreground shrink-0 text-xs tabular-nums"
                title="Content similarity"
              >
                {Math.round(s.score * 100)}%
              </span>
            </Link>
          ))
        )}
        {data && data.similar.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 self-start"
            nativeButton={false}
            render={<Link href={`/e/${slug}/compare?ids=${projectId}`} />}
          >
            <GitCompareArrows /> Compare side by side
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Comments({ projectId, canModerate }: { projectId: string; canModerate: boolean }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const qc = useQueryClient();
  const key = ["comments", projectId];
  const [body, setBody] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ comments: CommentRow[] }>(`/api/projects/${projectId}/comments`),
  });
  const post = useMutation({
    mutationFn: (text: string) =>
      api.post<{ id: string }>(`/api/projects/${projectId}/comments`, { body: text }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (commentId: string) => api.delete(`/api/comments/${commentId}`),
    onSuccess: () => {
      toast.success("Comment deleted");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e.message),
  });
  const comments = data?.comments ?? [];

  return (
    <section className="flex flex-col gap-5" aria-labelledby="comments-title">
      <h3
        id="comments-title"
        className="flex items-center gap-2 text-lg font-semibold tracking-tight"
      >
        <MessageSquare className="size-4" /> Discussion
        <span className="text-muted-foreground text-sm font-normal tabular-nums">
          {comments.length || ""}
        </span>
      </h3>

      {viewer ? (
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) post.mutate(body.trim());
          }}
        >
          <UserAvatar name={viewer.name} image={viewer.image} className="mt-1" />
          <div className="flex flex-1 flex-col gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ask a question or leave feedback for the team…"
              aria-label="Write a comment"
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim())
                  post.mutate(body.trim());
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                Be kind and constructive. Ctrl+Enter to post.
              </span>
              <Button type="submit" size="sm" disabled={!body.trim() || post.isPending}>
                {post.isPending && <Spinner />} Post comment
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
          <span className="text-muted-foreground">Sign in to join the discussion.</span>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/login?next=${encodeURIComponent(pathname)}`} />}
          >
            Sign in
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No comments yet — be the first to say something nice.
        </p>
      ) : (
        <ol className="flex flex-col gap-5">
          {comments.map((c) => {
            const own = viewer && c.authorId === viewer.userId;
            return (
              <li key={c.id} className="group/comment flex gap-3">
                <UserAvatar name={c.authorName} image={c.authorImage} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    {c.authorUsername ? (
                      <Link href={`/u/${c.authorUsername}`} className="font-medium hover:underline">
                        {c.authorName}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.authorName}</span>
                    )}
                    <time
                      className="text-muted-foreground text-xs"
                      dateTime={c.createdAt}
                      title={formatDate(c.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    >
                      {relativeTime(c.createdAt)}
                    </time>
                    {(own || canModerate) && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground ml-auto"
                        aria-label="Delete comment"
                        disabled={remove.isPending && remove.variables === c.id}
                        onClick={() => remove.mutate(c.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-pretty break-words">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <Skeleton className="aspect-[3/1] w-full rounded-2xl" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
