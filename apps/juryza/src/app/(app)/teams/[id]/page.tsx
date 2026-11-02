"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  FolderKanban,
  LogOut,
  PencilLine,
  Plus,
  RefreshCw,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
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
  AlertDialogTrigger,
} from "@juryza/ui/components/ui/alert-dialog";
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
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Input } from "@juryza/ui/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@juryza/ui/components/ui/input-group";
import { Label } from "@juryza/ui/components/ui/label";
import { Progress } from "@juryza/ui/components/ui/progress";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Switch } from "@juryza/ui/components/ui/switch";
import { Textarea } from "@juryza/ui/components/ui/textarea";

import { EventCover } from "@/components/event-bits";
import { UserAvatar } from "@/components/user-avatar";
import { useViewer } from "@/components/viewer";
import { api } from "@/lib/api";
import { formatDate, hueOf, relativeTime } from "@/lib/format";

/**
 * A team's home: name and pitch (editable by the owner), the roster with
 * roles, the invite link, the team's project, and a danger zone. Rosters lock
 * at the submission deadline — the API enforces it; the UI just explains it.
 */

interface TeamData {
  team: {
    id: string;
    name: string;
    description: string | null;
    lookingForMembers: boolean;
    createdAt: string;
    inviteUrl?: string;
  };
  event: {
    id: string;
    slug: string;
    name: string;
    maxTeamSize: number;
    submissionsClose: string;
    workflow: string;
  };
  members: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    headline: string | null;
    role: string;
    joinedAt: string;
  }[];
  project: { id: string; title: string; status: string } | null;
  viewer: {
    role: string | null;
    canManage: boolean;
    canReviewRequests: boolean;
    open: boolean;
  };
}

interface JoinRequest {
  id: string;
  status: string;
  createdAt: string;
  participant: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    image: string | null;
    headline: string | null;
  };
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useViewer();
  const queryClient = useQueryClient();
  const key = ["team", id];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<TeamData>(`/api/teams/${id}`),
  });
  const requests = useQuery({
    queryKey: ["team", id, "join-requests"],
    queryFn: () => api.get<{ requests: JoinRequest[] }>(`/api/teams/${id}/join`),
    enabled: data?.viewer.canReviewRequests ?? false,
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["team", id, "join-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
    if (data) void queryClient.invalidateQueries({ queryKey: ["event", data.event.slug] });
  };

  const patch = useMutation({
    mutationFn: (body: {
      name?: string;
      description?: string | null;
      lookingForMembers?: boolean;
    }) => api.patch(`/api/teams/${id}`, body),
    onSuccess: () => {
      refresh();
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetInvite = useMutation({
    mutationFn: () => api.post<{ inviteUrl: string }>(`/api/teams/${id}/invite`),
    onSuccess: () => {
      toast.success("Lien d’invitation réinitialisé", { description: "L’ancien lien ne fonctionne plus." });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api.delete<{ ok: true; disbanded: boolean }>(`/api/teams/${id}/members/${userId}`),
    onSuccess: (res, userId) => {
      if (userId === me?.userId || res.disbanded) {
        toast.success(res.disbanded ? "Groupe supprimé" : "Vous avez quitté le projet");
        void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
        router.push("/projects");
      } else {
        toast.success("Participant retiré");
        refresh();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const reviewRequest = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: "approve" | "reject" }) =>
      api.patch<{ status: "approved" | "rejected" }>(`/api/teams/${id}/join`, {
        requestId,
        decision,
      }),
    onSuccess: ({ status }) => {
      toast.success(status === "approved" ? "Participant ajouté" : "Demande refusée");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const disband = useMutation({
    mutationFn: () => api.delete(`/api/teams/${id}`),
    onSuccess: () => {
      toast.success("Groupe supprimé");
      void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      router.push("/projects");
    },
    onError: (e) => toast.error(e.message),
  });

  const startProject = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(`/api/events/${data?.event.slug}/projects`, {
        title: "Untitled project",
      }),
    onSuccess: ({ id: projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      router.push(`/projects/${projectId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRound />
          </EmptyMedia>
          <EmptyTitle>Projet introuvable</EmptyTitle>
          <EmptyDescription>{error?.message ?? "Il a peut-être été supprimé."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/projects" />}>
            <ArrowLeft /> Mes projets
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const { team, event, members, project, viewer } = data;
  const owner = viewer.role === "owner" || viewer.canManage;
  const canReviewRequests = viewer.canReviewRequests;
  const member = viewer.role !== null;
  const seatsLeft = Math.max(0, event.maxTeamSize - members.length);
  const locked = !viewer.open;
  const hue = hueOf(team.id);

  const copy = async () => {
    if (!team.inviteUrl) return;
    await navigator.clipboard.writeText(team.inviteUrl);
    setCopied(true);
    toast.success("Invite link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <EventCover hue={hue} className="h-20" />
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          {editing ? (
            <form
              className="flex w-full max-w-xl flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                patch.mutate({ name: name.trim(), description: description.trim() || null });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="team-name">Nom du projet</Label>
                <Input
                  id="team-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={60}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="team-desc">Description du projet et profils recherchés</Label>
                <Textarea
                  id="team-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={patch.isPending || name.trim().length < 2}
                >
                  {patch.isPending && <Spinner />} Enregistrer
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                href={`/e/${event.slug}`}
                className="text-muted-foreground text-sm hover:underline"
              >
                {event.name}
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{team.name}</h1>
              <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
                {team.description ||
                  (owner
                    ? "Ajoutez une courte description du projet."
                    : "Aucune description.")}
              </p>
            </div>
          )}
          {!editing && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {team.lookingForMembers && seatsLeft > 0 && (
                <Badge variant="secondary">Inscriptions ouvertes</Badge>
              )}
              {owner && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setName(team.name);
                    setDescription(team.description ?? "");
                    setEditing(true);
                  }}
                >
                  <PencilLine /> Modifier
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {locked && (
        <Alert>
          <UsersRound />
          <AlertTitle>Composition du groupe verrouillée</AlertTitle>
          <AlertDescription>
            Le projet est terminé depuis {relativeTime(event.submissionsClose)}. Les participants ne
            peuvent plus rejoindre ou quitter le groupe.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Participants</CardTitle>
              <CardDescription>
                {members.length} sur {event.maxTeamSize} ·{" "}
                {seatsLeft ? `${seatsLeft} place(s) disponible(s)` : "Groupe complet"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Progress
                value={(members.length / event.maxTeamSize) * 100}
                aria-label="Places occupées"
              />
              <ul className="-mx-2 flex flex-col">
                {members.map((m) => {
                  const self = m.id === me?.userId;
                  return (
                    <li
                      key={m.id}
                      className="hover:bg-muted/50 flex items-center gap-3 rounded-lg px-2 py-2"
                    >
                      <UserAvatar name={m.name} image={m.image} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {m.username ? (
                            <Link href={`/u/${m.username}`} className="truncate hover:underline">
                              {m.name}
                            </Link>
                          ) : (
                            m.name
                          )}
                          {self && <span className="text-muted-foreground font-normal">(vous)</span>}
                          {m.role === "owner" && (
                            <Crown
                              className="text-warning size-3.5 shrink-0"
                              aria-label="Responsable du projet"
                            />
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {m.headline || (m.role === "owner" ? "Responsable" : "Participant")} · rejoint le{" "}
                          {formatDate(m.joinedAt)}
                        </p>
                      </div>
                      {!locked &&
                        (self || owner) &&
                        !(event.workflow === "innolab" && m.role === "owner") && (
                        <ConfirmButton
                          label={self ? "Quitter" : "Retirer"}
                          icon={self ? LogOut : UserMinus}
                          title={self ? "Quitter ce projet ?" : `Retirer ${m.name} ?`}
                          description={
                            self
                              ? members.length === 1
                                ? "You're the last member, so the team will be disbanded."
                                : m.role === "owner"
                                  ? "Ownership passes to the longest-serving member."
                                  : event.workflow === "innolab"
                                    ? "Vous devrez envoyer une nouvelle demande pour revenir."
                                    : "You can rejoin later with an invite link while submissions are open."
                              : event.workflow === "innolab"
                                ? "Cette personne perdra l’accès au projet et devra envoyer une nouvelle demande approuvée pour revenir."
                                : "They lose access to the team's draft project. They can rejoin with the invite link."
                          }
                          confirm={self ? "Quitter le projet" : "Retirer"}
                          pending={removeMember.isPending && removeMember.variables === m.id}
                          onConfirm={() => removeMember.mutate(m.id)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {canReviewRequests && (
            <Card>
              <CardHeader>
                <CardTitle>Demandes d’inscription</CardTitle>
                <CardDescription>
                  Le responsable du projet et les coachs peuvent accepter ou refuser les participants.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {requests.isLoading ? (
                  <Skeleton className="h-20 rounded-lg" />
                ) : requests.data?.requests.length ? (
                  <ul className="flex flex-col gap-2">
                    {requests.data.requests.map((request) => {
                      const reviewing =
                        reviewRequest.isPending &&
                        reviewRequest.variables?.requestId === request.id;
                      return (
                        <li
                          key={request.id}
                          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                        >
                          <UserAvatar
                            name={request.participant.name}
                            image={request.participant.image}
                            className="size-9"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {request.participant.name}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {request.participant.headline || request.participant.email} · demande du{" "}
                              {formatDate(request.createdAt)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                reviewRequest.mutate({ requestId: request.id, decision: "approve" })
                              }
                              disabled={reviewRequest.isPending}
                            >
                              {reviewing ? <Spinner /> : <CheckCircle2 />} Accepter
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                reviewRequest.mutate({ requestId: request.id, decision: "reject" })
                              }
                              disabled={reviewRequest.isPending}
                            >
                              <X /> Refuser
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">Aucune demande en attente.</p>
                )}
              </CardContent>
            </Card>
          )}

          {member && team.inviteUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Invite teammates</CardTitle>
                <CardDescription>
                  Anyone signed in with this link joins the team while seats and submissions are
                  open.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <InputGroup>
                  <InputGroupInput
                    readOnly
                    value={team.inviteUrl}
                    aria-label="Invite link"
                    onFocus={(e) => e.target.select()}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton onClick={copy} aria-label="Copy invite link">
                      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {viewer.role === "owner" && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs">
                      Link leaked? Reset it — the old one stops working immediately.
                    </p>
                    <ConfirmButton
                      label="Reset link"
                      icon={RefreshCw}
                      variant="outline"
                      title="Reset the invite link?"
                      description="Anyone holding the current link won't be able to join with it anymore."
                      confirm="Reset link"
                      destructive={false}
                      pending={resetInvite.isPending}
                      onConfirm={() => resetInvite.mutate()}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="size-4" /> Projet
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {project ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{project.title}</p>
                    <Badge
                      variant={project.status === "submitted" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {project.status}
                    </Badge>
                  </div>
                  {member || viewer.canManage ? (
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/projects/${project.id}`} />}
                    >
                      <PencilLine /> {viewer.open ? "Ouvrir l’éditeur" : "Voir le projet"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/e/${event.slug}/projects/${project.id}`} />}
                    >
                      Voir le projet
                    </Button>
                  )}
                </>
              ) : member && viewer.open && event.workflow !== "innolab" ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    No project yet. Start one and write it up together.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => startProject.mutate()}
                    disabled={startProject.isPending}
                  >
                    {startProject.isPending ? <Spinner /> : <Plus />} Start a project
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Le projet associé à ce pitch n’est pas encore disponible.
                </p>
              )}
            </CardContent>
          </Card>

          {canReviewRequests && (
            <Card>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="looking">Inscriptions ouvertes</Label>
                  <p className="text-muted-foreground text-xs">
                    Autoriser les participants inscrits à envoyer une demande.
                  </p>
                </div>
                <Switch
                  id="looking"
                  checked={team.lookingForMembers}
                  disabled={patch.isPending}
                  onCheckedChange={(checked) => patch.mutate({ lookingForMembers: checked })}
                />
              </CardContent>
            </Card>
          )}

          {owner && (event.workflow !== "innolab" || viewer.canManage) && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive">Zone sensible</CardTitle>
                <CardDescription>
                  {project
                    ? "Le projet doit être supprimé avant son groupe."
                    : "La suppression retire tous les participants de ce groupe."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfirmButton
                  label="Supprimer le groupe"
                  icon={UsersRound}
                  variant="destructive"
                  title={`Supprimer ${team.name} ?`}
                  description="Tous les participants seront retirés. Cette action est irréversible."
                  confirm="Supprimer le groupe"
                  disabled={(!!project || locked) && !viewer.canManage}
                  pending={disband.isPending}
                  onConfirm={() => disband.mutate()}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function ConfirmButton({
  label,
  icon: Icon,
  title,
  description,
  confirm,
  onConfirm,
  pending,
  disabled,
  variant = "ghost",
  destructive = true,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => void;
  pending?: boolean;
  disabled?: boolean;
  variant?: "ghost" | "outline" | "destructive";
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button size="sm" variant={variant} disabled={disabled || pending} />}
      >
        {pending ? <Spinner /> : <Icon />} {label}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
