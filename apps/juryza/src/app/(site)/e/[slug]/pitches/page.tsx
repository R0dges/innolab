"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lightbulb, Pencil, Plus, Rocket, UsersRound, Vote } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
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
import { Checkbox } from "@juryza/ui/components/ui/checkbox";
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@juryza/ui/components/ui/field";
import { Input } from "@juryza/ui/components/ui/input";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Textarea } from "@juryza/ui/components/ui/textarea";

import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { pluralize } from "@/lib/format";

type PitchStatus = "draft" | "submitted" | "selected" | "rejected";

interface PitchRow {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorImage: string | null;
  title: string;
  description: string;
  status: PitchStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  votes: number | null;
  projectId: string | null;
  voted: boolean;
  mine: boolean;
}

interface PitchList {
  event: { id: string; slug: string; name: string };
  pitches: PitchRow[];
  viewer: null | {
    userId: string;
    registered: boolean;
    canManage: boolean;
    canCreate: boolean;
    canVote: boolean;
  };
  phase: {
    submissionsOpen: boolean;
    votingOpen: boolean;
    votingClosed: boolean;
    formationOpen: boolean;
    showVoteCounts: boolean;
  };
}

const pitchesKey = (slug: string) => ["event", slug, "pitches"] as const;
const PITCH_SKELETONS = [
  "pitch-skeleton-a",
  "pitch-skeleton-b",
  "pitch-skeleton-c",
  "pitch-skeleton-d",
];

export default function PitchesPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: pitchesKey(slug),
    queryFn: () => api.get<PitchList>(`/api/events/${slug}/pitches`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: pitchesKey(slug) });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load ideas</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading || !data) return <PitchSkeleton />;

  const pitches = data.phase.showVoteCounts
    ? data.pitches.toSorted((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
    : data.pitches;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Ideas</h2>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Propose the starting point, vote on submitted ideas, then turn the selected ones into
            teams and projects.
          </p>
        </div>
        {data.viewer?.canCreate && (
          <PitchDialog
            slug={slug}
            onSaved={refresh}
            trigger={
              <Button>
                <Plus data-icon="inline-start" />
                Propose an idea
              </Button>
            }
          />
        )}
      </div>

      <PhaseNotice data={data} />
      {data.viewer?.canManage && data.phase.votingClosed && (
        <SelectionPanel slug={slug} pitches={data.pitches} onSaved={refresh} />
      )}

      {pitches.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>No ideas yet</EmptyTitle>
            <EmptyDescription>
              {data.phase.submissionsOpen
                ? "Start with a problem worth solving and a clear one-minute pitch."
                : "No ideas were submitted during this edition."}
            </EmptyDescription>
          </EmptyHeader>
          {data.viewer?.canCreate && (
            <EmptyContent>
              <PitchDialog
                slug={slug}
                onSaved={refresh}
                trigger={<Button>Propose an idea</Button>}
              />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {pitches.map((pitch, index) => (
            <PitchCard
              key={pitch.id}
              pitch={pitch}
              rank={data.phase.showVoteCounts ? index + 1 : null}
              slug={slug}
              viewer={data.viewer}
              phase={data.phase}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseNotice({ data }: { data: PitchList }) {
  if (!data.viewer) {
    return (
      <Alert>
        <Lightbulb />
        <AlertTitle>Sign in to participate</AlertTitle>
        <AlertDescription>Registered participants can propose ideas and vote.</AlertDescription>
      </Alert>
    );
  }
  if (!data.viewer.registered && !data.viewer.canManage) {
    return (
      <Alert>
        <Lightbulb />
        <AlertTitle>Registration required</AlertTitle>
        <AlertDescription>
          Register from the event overview before proposing or voting.
        </AlertDescription>
      </Alert>
    );
  }
  if (data.phase.votingOpen) {
    return (
      <Alert>
        <Vote />
        <AlertTitle>Idea voting is open</AlertTitle>
        <AlertDescription>
          Each voter can support each idea once. There is no global vote budget.
        </AlertDescription>
      </Alert>
    );
  }
  if (data.phase.votingClosed) {
    return (
      <Alert>
        <Check />
        <AlertTitle>Idea voting is closed</AlertTitle>
        <AlertDescription>
          Vote totals and the organizer's selection are now visible.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function PitchCard({
  pitch,
  rank,
  slug,
  viewer,
  phase,
  onSaved,
}: {
  pitch: PitchRow;
  rank: number | null;
  slug: string;
  viewer: PitchList["viewer"];
  phase: PitchList["phase"];
  onSaved: () => void;
}) {
  const vote = useMutation({
    mutationFn: () =>
      pitch.voted
        ? api.delete(`/api/pitches/${pitch.id}/vote`)
        : api.post(`/api/pitches/${pitch.id}/vote`),
    onSuccess: () => {
      toast.success(pitch.voted ? "Vote removed" : "Vote recorded");
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const author = pitch.authorUsername ? (
    <Link href={`/u/${pitch.authorUsername}`} className="hover:underline">
      {pitch.authorName}
    </Link>
  ) : (
    pitch.authorName
  );

  return (
    <Card className="gap-0 py-0">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="flex min-w-0 flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              {rank !== null && (
                <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg font-semibold tabular-nums">
                  {rank}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{pitch.title}</CardTitle>
                  <StatusBadge status={pitch.status} />
                </div>
                <CardDescription className="mt-1 flex items-center gap-2">
                  <UserAvatar
                    name={pitch.authorName}
                    image={pitch.authorImage}
                    className="size-6"
                  />
                  {author}
                </CardDescription>
              </div>
              {pitch.mine && pitch.status === "draft" && phase.submissionsOpen && (
                <PitchDialog
                  slug={slug}
                  pitch={pitch}
                  onSaved={onSaved}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                  }
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{pitch.description}</p>
          </CardContent>
          {(pitch.projectId ||
            (pitch.mine && pitch.status === "selected" && phase.formationOpen)) && (
            <CardFooter className="border-t py-3">
              {pitch.projectId ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/projects/${pitch.projectId}`} />}
                >
                  <Rocket data-icon="inline-start" />
                  Open project
                </Button>
              ) : (
                <ProjectDialog pitch={pitch} onSaved={onSaved} />
              )}
            </CardFooter>
          )}
        </div>
        <div className="border-t p-4 sm:border-t-0 sm:border-l">
          <div className="flex h-full items-center justify-between gap-3 sm:flex-col sm:justify-center">
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums">{pitch.votes ?? "—"}</p>
              <p className="text-muted-foreground text-xs">
                {pitch.votes === null ? "Hidden" : pluralize(pitch.votes, "vote")}
              </p>
            </div>
            {viewer?.canVote && pitch.status === "submitted" && (
              <Button
                variant={pitch.voted ? "default" : "outline"}
                size="sm"
                disabled={vote.isPending}
                onClick={() => vote.mutate()}
              >
                {vote.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Vote data-icon="inline-start" />
                )}
                {pitch.voted ? "Supported" : "Support"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: PitchStatus }) {
  const label = {
    draft: "Draft",
    submitted: "Submitted",
    selected: "Selected",
    rejected: "Not selected",
  }[status];
  return (
    <Badge
      variant={status === "selected" ? "default" : status === "submitted" ? "outline" : "secondary"}
    >
      {label}
    </Badge>
  );
}

function PitchDialog({
  slug,
  pitch,
  trigger,
  onSaved,
}: {
  slug: string;
  pitch?: PitchRow;
  trigger: React.ReactElement;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(pitch?.title ?? "");
  const [description, setDescription] = useState(pitch?.description ?? "");
  const save = useMutation({
    mutationFn: (submit: boolean) =>
      pitch
        ? api.patch(`/api/pitches/${pitch.id}`, {
            title,
            description,
            ...(submit && { submit: true }),
          })
        : api.post(`/api/events/${slug}/pitches`, { title, description, submit }),
    onSuccess: (_result, submit) => {
      toast.success(submit ? "Idea submitted" : "Draft saved");
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const ready = title.trim().length >= 3 && description.trim().length >= 10;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{pitch ? "Edit idea" : "Propose an idea"}</DialogTitle>
          <DialogDescription>
            Keep the one-minute pitch concrete. Once submitted, this text is frozen and remains
            independent from the project.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`pitch-title-${pitch?.id ?? "new"}`}>Title</FieldLabel>
            <Input
              id={`pitch-title-${pitch?.id ?? "new"}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={100}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`pitch-description-${pitch?.id ?? "new"}`}>
              One-minute pitch
            </FieldLabel>
            <Textarea
              id={`pitch-description-${pitch?.id ?? "new"}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={10}
              maxLength={3000}
              rows={8}
              required
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => save.mutate(false)}
            disabled={!ready || save.isPending}
          >
            {save.isPending && <Spinner data-icon="inline-start" />}Save draft
          </Button>
          <Button onClick={() => save.mutate(true)} disabled={!ready || save.isPending}>
            <Rocket data-icon="inline-start" />
            Submit idea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectionPanel({
  slug,
  pitches,
  onSaved,
}: {
  slug: string;
  pitches: PitchRow[];
  onSaved: () => void;
}) {
  const candidates = useMemo(() => pitches.filter((pitch) => pitch.status !== "draft"), [pitches]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected(candidates.filter((pitch) => pitch.status === "selected").map((pitch) => pitch.id));
  }, [candidates]);
  const minimum = Math.min(5, candidates.length);
  const maximum = Math.min(6, candidates.length);
  const valid = selected.length >= minimum && selected.length <= maximum;
  const save = useMutation({
    mutationFn: () => api.post(`/api/events/${slug}/pitch-selection`, { pitchIds: selected }),
    onSuccess: () => {
      toast.success("Selected ideas updated");
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select the ideas that move forward</CardTitle>
        <CardDescription>
          Choose{" "}
          {candidates.length < 5 ? `all ${candidates.length} submitted ideas` : "5 or 6 ideas"}. The
          others remain archived as not selected.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {candidates.map((pitch) => (
          <label
            htmlFor={`select-${pitch.id}`}
            key={pitch.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
          >
            <Checkbox
              id={`select-${pitch.id}`}
              checked={selected.includes(pitch.id)}
              disabled={!selected.includes(pitch.id) && selected.length >= maximum}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked ? [...current, pitch.id] : current.filter((id) => id !== pitch.id)
                )
              }
            />
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">{pitch.title}</span>
              <span className="text-muted-foreground">{pitch.votes ?? 0} votes</span>
            </span>
          </label>
        ))}
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <span className="text-muted-foreground text-sm tabular-nums">
          {selected.length} selected
        </span>
        <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          Save selection
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProjectDialog({ pitch, onSaved }: { pitch: PitchRow; onSaved: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [projectTitle, setProjectTitle] = useState(pitch.title);
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(`/api/pitches/${pitch.id}/project`, { teamName, projectTitle }),
    onSuccess: (result) => {
      toast.success("Team and project created");
      onSaved();
      router.push(`/projects/${result.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <UsersRound data-icon="inline-start" />
            Create team and project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start building “{pitch.title}”</DialogTitle>
          <DialogDescription>
            This explicit action creates your team and a draft project linked to the original pitch.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`team-${pitch.id}`}>Team name</FieldLabel>
            <Input
              id={`team-${pitch.id}`}
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`project-${pitch.id}`}>Project title</FieldLabel>
            <Input
              id={`project-${pitch.id}`}
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              maxLength={100}
              required
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={create.isPending || teamName.trim().length < 2 || !projectTitle.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Rocket data-icon="inline-start" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PitchSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-2/3" />
      {PITCH_SKELETONS.map((key) => (
        <Skeleton key={key} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}
