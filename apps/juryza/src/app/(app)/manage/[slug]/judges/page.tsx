"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, Link2, MailPlus, MoreHorizontal, Tags, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@juryza/ui/components/ui/alert-dialog";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card } from "@juryza/ui/components/ui/card";
import { Checkbox } from "@juryza/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@juryza/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@juryza/ui/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Input } from "@juryza/ui/components/ui/input";
import { Label } from "@juryza/ui/components/ui/label";
import { Progress } from "@juryza/ui/components/ui/progress";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@juryza/ui/components/ui/table";

import { CopyButton } from "@/components/copy-button";
import { PageHeader, Section, StatCard } from "@/components/page";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/format";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { eventKey, useEvent } from "@/lib/queries";

/**
 * Judging panel: who judges this event, which tracks each covers, and how far
 * through their assignments they are. Invite by email (existing accounts join
 * at once; others get a single-use link), edit track coverage, remove judges,
 * and manage pending invitations.
 */

interface PanelJudge {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  trackIds: string[];
  joinedAt: string;
  assigned: number;
  scored: number;
  lastScoredAt: string | null;
}
interface Invite {
  id: string;
  email: string;
  trackIds: string[];
  createdAt: string;
  inviteUrl: string;
}
interface Panel {
  canInvite: boolean;
  canRemove: boolean;
  judges: PanelJudge[];
  invites: Invite[];
}
type InviteResult =
  | { status: "added"; userId: string; name: string }
  | { status: "invited"; inviteUrl: string };

export default function JudgesPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data: detail } = useEvent(slug);
  const tracks = detail?.tracks ?? [];
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const key = ["judges", slug];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<Panel>(`/api/events/${slug}/judges`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: eventKey(slug) });
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<PanelJudge | null>(null);
  const [removing, setRemoving] = useState<PanelJudge | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/events/${slug}/judges/${id}`),
    onSuccess: (_, id) => {
      toast.success(
        id.startsWith("inv_")
          ? "Invitation revoked"
          : "Judge removed — unscored assignments released"
      );
      setRemoving(null);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const judges = data?.judges ?? [];
  const assigned = judges.reduce((n, j) => n + j.assigned, 0);
  const scored = judges.reduce((n, j) => n + Math.min(j.scored, j.assigned || j.scored), 0);
  const idle = judges.filter((j) => j.assigned > 0 && j.scored === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Judges"
        description="Your judging panel and its progress through assigned reviews. Existing judges can invite other judges."
        actions={
          data?.canInvite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus /> Invite judge
            </Button>
          ) : null
        }
      />

      {data && !data.canRemove && detail?.event.workflow === "innolab" && (
        <Alert>
          <AlertTitle>Shared invitations, admin-controlled removals</AlertTitle>
          <AlertDescription>
            Every judge on this panel can invite another judge. Only a platform admin can remove an
            Innolab judge or revoke a pending invitation.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Judges" value={isLoading ? "…" : judges.length} icon={Gavel} />
        <StatCard
          label="Pending invites"
          value={isLoading ? "…" : (data?.invites.length ?? 0)}
          icon={MailPlus}
        />
        <StatCard
          label="Reviews done"
          value={isLoading ? "…" : `${formatNumber(scored)} / ${formatNumber(assigned)}`}
          hint={
            assigned ? `${Math.round((scored / assigned) * 100)}% complete` : "No assignments yet"
          }
        />
        <StatCard
          label="Not started"
          value={isLoading ? "…" : idle}
          hint="Judges with work but no scores"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load the panel</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : judges.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Gavel />
            </EmptyMedia>
            <EmptyTitle>No judges yet</EmptyTitle>
            <EmptyDescription>
              Invite judges by email. Anyone with an account joins the panel straight away.
            </EmptyDescription>
          </EmptyHeader>
          {data?.canInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus /> Invite judge
            </Button>
          )}
        </Empty>
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Judge</TableHead>
                  {EVENT_TRACKS_ENABLED && <TableHead>Tracks</TableHead>}
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Scored</TableHead>
                  <TableHead className="w-40">Progress</TableHead>
                  <TableHead>Last activity</TableHead>
                  {data?.canRemove && (
                    <TableHead className="w-10 pr-4">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {judges.map((j) => {
                  const pct = j.assigned
                    ? Math.min(100, Math.round((j.scored / j.assigned) * 100))
                    : 0;
                  return (
                    <TableRow key={j.id}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={j.name} image={j.image} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{j.name}</p>
                            <p className="text-muted-foreground truncate text-xs">{j.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      {EVENT_TRACKS_ENABLED && (
                        <TableCell>
                          <TrackBadges ids={j.trackIds} names={trackName} />
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{j.assigned}</TableCell>
                      <TableCell className="text-right tabular-nums">{j.scored}</TableCell>
                      <TableCell>
                        {j.assigned ? (
                          <div className="flex items-center gap-2">
                            <Progress
                              value={pct}
                              className="flex-1"
                              aria-label={`${pct}% reviewed`}
                            />
                            <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No assignments</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground text-sm"
                        title={j.lastScoredAt ? formatDateTime(j.lastScoredAt) : undefined}
                      >
                        {j.lastScoredAt ? relativeTime(j.lastScoredAt) : "—"}
                      </TableCell>
                      {data?.canRemove && (
                        <TableCell className="pr-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Actions for ${j.name}`}
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {EVENT_TRACKS_ENABLED && (
                                <>
                                  <DropdownMenuItem onClick={() => setEditing(j)}>
                                    <Tags /> Edit tracks
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setRemoving(j)}
                              >
                                <UserMinus /> Remove from panel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {data?.canInvite && data.invites.length > 0 && (
        <Section
          title="Pending invitations"
          description="Juryza runs without an email server — share each link with its judge. A link only works for the address it was issued to."
        >
          <Card className="py-0">
            <ul className="divide-y">
              {data.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link2 className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.email}</p>
                    <p className="text-muted-foreground text-xs">
                      Invited {relativeTime(i.createdAt)}
                    </p>
                  </div>
                  {EVENT_TRACKS_ENABLED && <TrackBadges ids={i.trackIds} names={trackName} />}
                  <CopyButton value={i.inviteUrl} label="Copy link" />
                  {data.canRemove && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Revoke invitation for ${i.email}`}
                      disabled={remove.isPending && remove.variables === i.id}
                      onClick={() => remove.mutate(i.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {data?.canInvite && (
        <InviteDialog
          slug={slug}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          tracks={tracks}
          onDone={refresh}
        />
      )}

      {EVENT_TRACKS_ENABLED && data?.canRemove && editing && (
        <TracksDialog
          key={editing.id}
          slug={slug}
          judge={editing}
          tracks={tracks}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}

      <AlertDialog
        open={data?.canRemove === true && removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name} from the panel?</AlertDialogTitle>
            <AlertDialogDescription>
              Their {removing ? removing.assigned - removing.scored : 0} unscored assignment(s) are
              released so you can reassign them. The {removing?.scored ?? 0} score(s) they already
              gave are kept — they are part of the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => removing && remove.mutate(removing.id)}
            >
              {remove.isPending && <Spinner />} Remove judge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrackBadges({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  if (ids.length === 0) return <Badge variant="outline">All tracks</Badge>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <Badge key={id} variant="secondary">
          {names.get(id) ?? "Unknown track"}
        </Badge>
      ))}
    </div>
  );
}

function TrackPicker({
  tracks,
  value,
  onChange,
}: {
  tracks: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  if (tracks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This event has no tracks, so judges review every project.
      </p>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Tracks</legend>
      {tracks.map((t) => (
        <Label
          key={t.id}
          className="hover:bg-muted/50 flex items-center gap-3 rounded-md border px-3 py-2 font-normal"
        >
          <Checkbox
            checked={value.includes(t.id)}
            onCheckedChange={(on) =>
              onChange(on ? [...value, t.id] : value.filter((x) => x !== t.id))
            }
          />
          {t.name}
        </Label>
      ))}
      <p className="text-muted-foreground text-xs">
        {value.length === 0
          ? "None selected — this judge can review projects in every track."
          : "This judge is only assigned (and only allowed to score) projects in the selected tracks."}
      </p>
    </fieldset>
  );
}

function InviteDialog({
  slug,
  open,
  onOpenChange,
  tracks,
  onDone,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tracks: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setTrackIds([]);
    setLink(null);
  };
  const invite = useMutation({
    mutationFn: () => api.post<InviteResult>(`/api/events/${slug}/judges`, { email, trackIds }),
    onSuccess: (res) => {
      onDone();
      if (res.status === "added") {
        toast.success(`${res.name} joined the judging panel`);
        onOpenChange(false);
        reset();
      } else {
        setLink(res.inviteUrl);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? "Share the invitation link" : "Invite a judge"}</DialogTitle>
          <DialogDescription>
            {link
              ? `No account exists for ${email} yet. Juryza is self-hosted and sends no email, so send this link yourself.`
              : "If they already have a Juryza account they join the panel immediately."}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="flex flex-col gap-3">
            <div className="bg-muted flex items-center gap-2 rounded-lg border p-2">
              <code className="min-w-0 flex-1 truncate px-1 font-mono text-xs">{link}</code>
              <CopyButton value={link} label="Copy" />
            </div>
            <p className="text-muted-foreground text-xs">
              The link only works when signed in (or signing up) as{" "}
              <span className="text-foreground">{email}</span>. It stays listed under pending
              invitations until accepted.
            </p>
          </div>
        ) : (
          <form
            id="invite-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                autoFocus
                placeholder="judge@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {EVENT_TRACKS_ENABLED && (
              <TrackPicker tracks={tracks} value={trackIds} onChange={setTrackIds} />
            )}
          </form>
        )}
        <DialogFooter>
          {link ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Done
            </Button>
          ) : (
            <Button type="submit" form="invite-form" disabled={!email || invite.isPending}>
              {invite.isPending ? <Spinner /> : <MailPlus />} Send invite
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TracksDialog({
  slug,
  judge,
  tracks,
  onClose,
  onDone,
}: {
  slug: string;
  judge: PanelJudge;
  tracks: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [trackIds, setTrackIds] = useState(judge.trackIds);
  const save = useMutation({
    mutationFn: () => api.patch(`/api/events/${slug}/judges/${judge.id}`, { trackIds }),
    onSuccess: () => {
      toast.success(`Updated ${judge.name}'s tracks`);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tracks for {judge.name}</DialogTitle>
          <DialogDescription>
            Existing assignments are kept; new assignment runs respect the change, and scoring
            re-checks eligibility.
          </DialogDescription>
        </DialogHeader>
        <TrackPicker tracks={tracks} value={trackIds} onChange={setTrackIds} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} Save tracks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
