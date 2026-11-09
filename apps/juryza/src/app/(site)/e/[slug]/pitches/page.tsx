"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Lightbulb, Pencil, Plus, Rocket, Vote } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@juryza/ui/components/ui/field";
import { Input } from "@juryza/ui/components/ui/input";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Textarea } from "@juryza/ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@juryza/ui/components/ui/toggle-group";

import { useI18n } from "@/components/locale-provider";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { pitchIsEditable } from "@/lib/innolab";

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
    canCoach: boolean;
    canCoachVote: boolean;
    canCreate: boolean;
    canVote: boolean;
  };
  phase: {
    submissionsOpen: boolean;
    presentationOpen: boolean;
    presentationCanOpen: boolean;
    votingOpen: boolean;
    votingClosed: boolean;
    formationOpen: boolean;
    showVoteCounts: boolean;
  };
  selection: null | {
    participantCount: number;
    candidateCount: number;
    recommended: { minimum: number; maximum: number };
    finalized: boolean;
    count: number | null;
    finalizedAt: string | null;
    tieBreak: null | {
      round: number;
      candidatePitchIds: string[];
      slots: number;
      totals: { pitchId: string; votes: number }[];
      myPitchIds: string[];
    };
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
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: pitchesKey(slug),
    queryFn: () => api.get<PitchList>(`/api/events/${slug}/pitches`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: pitchesKey(slug) });

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("pitches.loadError")}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading || !data) return <PitchSkeleton />;

  const pitches = data.phase.showVoteCounts
    ? data.pitches.toSorted(
        (a, b) =>
          (b.votes ?? 0) - (a.votes ?? 0) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id)
      )
    : data.pitches;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t("pitches.title")}</h2>
          <p className="text-muted-foreground max-w-2xl text-sm">{t("pitches.description")}</p>
        </div>
        {data.viewer?.canCreate && (
          <PitchDialog
            slug={slug}
            onSaved={refresh}
            trigger={
              <Button>
                <Plus data-icon="inline-start" />
                {t("pitches.propose")}
              </Button>
            }
          />
        )}
      </div>

      <PhaseNotice data={data} />
      {data.viewer?.canCoach && !data.phase.presentationOpen && (
        <PresentationPanel slug={slug} canOpen={data.phase.presentationCanOpen} onSaved={refresh} />
      )}
      {data.viewer?.canCoach &&
        data.phase.presentationOpen &&
        data.phase.votingClosed &&
        data.selection &&
        !data.selection.finalized &&
        (data.selection.tieBreak ? (
          <TieBreakPanel
            key={data.selection.tieBreak.round}
            slug={slug}
            count={data.selection.count ?? 0}
            tieBreak={data.selection.tieBreak}
            pitches={pitches}
            canVote={data.viewer.canCoachVote}
            onSaved={refresh}
          />
        ) : (
          <SelectionPanel slug={slug} selection={data.selection} onSaved={refresh} />
        ))}
      {data.selection?.finalized && (
        <Alert>
          <Rocket />
          <AlertTitle>{t("pitches.projectsCreated")}</AlertTitle>
          <AlertDescription>{t("pitches.projectsCreatedHint")}</AlertDescription>
        </Alert>
      )}

      {pitches.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>{t("pitches.none")}</EmptyTitle>
            <EmptyDescription>
              {!data.phase.presentationOpen
                ? t("pitches.privateHint")
                : data.phase.submissionsOpen
                  ? t("pitches.startHint")
                  : t("pitches.closedHint")}
            </EmptyDescription>
          </EmptyHeader>
          {data.viewer?.canCreate && (
            <EmptyContent>
              <PitchDialog
                slug={slug}
                onSaved={refresh}
                trigger={<Button>{t("pitches.propose")}</Button>}
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
  const { t } = useI18n();
  if (!data.viewer) {
    return (
      <Alert>
        <Lightbulb />
        <AlertTitle>{t("pitches.signIn")}</AlertTitle>
        <AlertDescription>{t("pitches.signInHint")}</AlertDescription>
      </Alert>
    );
  }
  if (!data.viewer.registered && !data.viewer.canCoach) {
    return (
      <Alert>
        <Lightbulb />
        <AlertTitle>{t("pitches.registrationRequired")}</AlertTitle>
        <AlertDescription>{t("pitches.registrationHint")}</AlertDescription>
      </Alert>
    );
  }
  if (!data.phase.presentationOpen) {
    return (
      <Alert>
        <Eye />
        <AlertTitle>{t("pitches.presentationWaiting")}</AlertTitle>
        <AlertDescription>{t("pitches.presentationWaitingHint")}</AlertDescription>
      </Alert>
    );
  }
  if (data.phase.votingOpen) {
    return (
      <Alert>
        <Vote />
        <AlertTitle>{t("pitches.votingOpen")}</AlertTitle>
        <AlertDescription>{t("pitches.votingOpenHint")}</AlertDescription>
      </Alert>
    );
  }
  if (data.phase.votingClosed) {
    return (
      <Alert>
        <Check />
        <AlertTitle>{t("pitches.votingClosed")}</AlertTitle>
        <AlertDescription>{t("pitches.votingClosedHint")}</AlertDescription>
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
  const { t } = useI18n();
  const vote = useMutation({
    mutationFn: () =>
      pitch.voted
        ? api.delete(`/api/pitches/${pitch.id}/vote`)
        : api.post(`/api/pitches/${pitch.id}/vote`),
    onSuccess: () => {
      toast.success(pitch.voted ? t("pitches.voteRemoved") : t("pitches.voteRecorded"));
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
              {pitch.mine && pitchIsEditable(pitch.status) && phase.submissionsOpen && (
                <PitchDialog
                  slug={slug}
                  pitch={pitch}
                  onSaved={onSaved}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Pencil data-icon="inline-start" />
                      {t("pitches.edit")}
                    </Button>
                  }
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{pitch.description}</p>
          </CardContent>
          {pitch.projectId && (
            <CardFooter className="border-t py-3">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/projects/${pitch.projectId}`} />}
              >
                <Rocket data-icon="inline-start" />
                {t("pitches.openProject")}
              </Button>
            </CardFooter>
          )}
        </div>
        <div className="border-t p-4 sm:border-t-0 sm:border-l">
          <div className="flex h-full items-center justify-between gap-3 sm:flex-col sm:justify-center">
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums">{pitch.votes ?? "—"}</p>
              <p className="text-muted-foreground text-xs">
                {pitch.votes === null
                  ? t("pitches.hidden")
                  : `${pitch.votes} ${t("pitches.votes")}`}
              </p>
            </div>
            {viewer?.canVote && !pitch.mine && pitch.status === "submitted" && (
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
                {pitch.voted ? t("pitches.selected") : t("pitches.choose")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: PitchStatus }) {
  const { t } = useI18n();
  const label = {
    draft: t("pitches.status.draft"),
    submitted: t("pitches.status.submitted"),
    selected: t("pitches.status.selected"),
    rejected: t("pitches.status.rejected"),
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(pitch?.title ?? "");
  const [description, setDescription] = useState(pitch?.description ?? "");
  const alreadySubmitted = pitch?.status === "submitted";
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
      toast.success(
        alreadySubmitted
          ? t("pitches.updated")
          : submit
            ? t("pitches.submitted")
            : t("pitches.saved")
      );
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
          <DialogTitle>{pitch ? t("pitches.editTitle") : t("pitches.propose")}</DialogTitle>
          <DialogDescription>{t("pitches.dialogHint")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`pitch-title-${pitch?.id ?? "new"}`}>
              {t("pitches.fieldTitle")}
            </FieldLabel>
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
              {t("pitches.fieldBody")}
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
          {!alreadySubmitted && (
            <Button
              variant="outline"
              onClick={() => save.mutate(false)}
              disabled={!ready || save.isPending}
            >
              {save.isPending && <Spinner data-icon="inline-start" />}
              {t("pitches.saveDraft")}
            </Button>
          )}
          <Button
            onClick={() => save.mutate(!alreadySubmitted)}
            disabled={!ready || save.isPending}
          >
            {save.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Rocket data-icon="inline-start" />
            )}
            {alreadySubmitted ? t("pitches.update") : t("pitches.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresentationPanel({
  slug,
  canOpen,
  onSaved,
}: {
  slug: string;
  canOpen: boolean;
  onSaved: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { t } = useI18n();
  const openPresentation = useMutation({
    mutationFn: () => api.post(`/api/events/${slug}/pitch-presentation`),
    onSuccess: () => {
      toast.success(t("pitches.presentationOpened"));
      setConfirmOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pitches.presentationTitle")}</CardTitle>
        <CardDescription>{t("pitches.presentationHint")}</CardDescription>
      </CardHeader>
      <CardFooter className="justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          {canOpen ? t("pitches.submissionsClosed") : t("pitches.waitClose")}
        </span>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger
            render={
              <Button disabled={!canOpen}>
                <Eye data-icon="inline-start" />
                {t("pitches.openPresentation")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pitches.revealTitle")}</DialogTitle>
              <DialogDescription>{t("pitches.revealHint")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                {t("pitches.cancel")}
              </Button>
              <Button
                disabled={openPresentation.isPending}
                onClick={() => openPresentation.mutate()}
              >
                {openPresentation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Eye data-icon="inline-start" />
                )}
                {t("pitches.reveal")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

function SelectionPanel({
  slug,
  selection,
  onSaved,
}: {
  slug: string;
  selection: NonNullable<PitchList["selection"]>;
  onSaved: () => void;
}) {
  const initialCount = Math.min(
    selection.candidateCount,
    Math.max(1, selection.recommended.minimum)
  );
  const [count, setCount] = useState(initialCount);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { t } = useI18n();
  const valid = Number.isInteger(count) && count >= 1 && count <= selection.candidateCount;
  const save = useMutation({
    mutationFn: () =>
      api.post<{ finalized: boolean }>(`/api/events/${slug}/pitch-selection`, { count }),
    onSuccess: (result) => {
      toast.success(result.finalized ? t("pitches.projectsCreated") : t("pitches.tieOpened"));
      setConfirmOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const recommendation =
    selection.recommended.minimum === selection.recommended.maximum
      ? `${selection.recommended.minimum}`
      : `${selection.recommended.minimum}–${selection.recommended.maximum}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pitches.selectionTitle")}</CardTitle>
        <CardDescription>{t("pitches.selectionHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field data-invalid={!valid}>
          <FieldLabel htmlFor="retained-pitch-count">{t("pitches.selectionCount")}</FieldLabel>
          <Input
            id="retained-pitch-count"
            type="number"
            min={1}
            max={selection.candidateCount}
            value={count}
            aria-invalid={!valid}
            onChange={(event) => setCount(event.target.valueAsNumber)}
          />
          <FieldDescription>
            {selection.participantCount} {t("pitches.participants")} · {t("pitches.recommendation")}
            : {recommendation} {t("event.projects").toLowerCase()} {t("pitches.groups")} ·{" "}
            {selection.candidateCount} {t("pitches.available")}.
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter className="justify-end">
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger
            render={
              <Button disabled={!valid}>
                <Check data-icon="inline-start" />
                {t("pitches.finalize")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pitches.confirmSelection")}</DialogTitle>
              <DialogDescription>{t("pitches.confirmSelectionHint")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                {t("pitches.cancel")}
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Rocket data-icon="inline-start" />
                )}
                {t("pitches.createProjects")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

function TieBreakPanel({
  slug,
  count,
  tieBreak,
  pitches,
  canVote,
  onSaved,
}: {
  slug: string;
  count: number;
  tieBreak: NonNullable<NonNullable<PitchList["selection"]>["tieBreak"]>;
  pitches: PitchRow[];
  canVote: boolean;
  onSaved: () => void;
}) {
  const [choices, setChoices] = useState<string[]>(tieBreak.myPitchIds);
  const { t } = useI18n();
  const candidates = tieBreak.candidatePitchIds.flatMap((pitchId) => {
    const candidate = pitches.find((pitch) => pitch.id === pitchId);
    return candidate ? [candidate] : [];
  });
  const totals = new Map(tieBreak.totals.map((total) => [total.pitchId, total.votes]));
  const ready = choices.length === tieBreak.slots;
  const vote = useMutation({
    mutationFn: () =>
      api.post(`/api/events/${slug}/pitch-selection/tie-break`, { pitchIds: choices }),
    onSuccess: () => {
      toast.success(t("pitches.tieVoteSaved"));
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const finalize = useMutation({
    mutationFn: () =>
      api.post<{ finalized: boolean }>(`/api/events/${slug}/pitch-selection`, {
        count,
      }),
    onSuccess: (result) => {
      toast.success(result.finalized ? t("pitches.projectsCreated") : t("pitches.tieNextRound"));
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{t("pitches.tieTitle")}</CardTitle>
          <Badge variant="secondary">
            {t("pitches.tieRound")} {tieBreak.round}
          </Badge>
        </div>
        <CardDescription>
          {t("pitches.tieHint")} {tieBreak.slots} {t("pitches.tieChoiceCount")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          multiple
          orientation="vertical"
          variant="outline"
          value={choices}
          disabled={!canVote || vote.isPending}
          className="w-full"
          onValueChange={(nextChoices) => {
            if (nextChoices.length <= tieBreak.slots) setChoices(nextChoices);
          }}
        >
          {candidates.map((candidate) => (
            <ToggleGroupItem
              key={candidate.id}
              value={candidate.id}
              className="h-auto w-full justify-between px-4 py-3"
            >
              <span className="min-w-0 text-left">
                <span className="block font-medium">{candidate.title}</span>
                <span className="text-muted-foreground block text-xs">
                  {candidate.authorName} · {candidate.votes ?? 0} {t("pitches.participantVotes")}
                </span>
              </span>
              <Badge variant="outline">
                {totals.get(candidate.id) ?? 0} {t("pitches.coachVotes")}
              </Badge>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={!canVote || !ready || vote.isPending}
          onClick={() => vote.mutate()}
        >
          {vote.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Vote data-icon="inline-start" />
          )}
          {t("pitches.tieSaveVote")}
        </Button>
        <Button disabled={count < 1 || finalize.isPending} onClick={() => finalize.mutate()}>
          {finalize.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Rocket data-icon="inline-start" />
          )}
          {t("pitches.tieFinalize")}
        </Button>
      </CardFooter>
    </Card>
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
