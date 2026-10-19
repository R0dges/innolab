"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, FolderCheck, Search, UserPlus, UsersRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent, CardFooter } from "@juryza/ui/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@juryza/ui/components/ui/input-group";
import { Label } from "@juryza/ui/components/ui/label";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Switch } from "@juryza/ui/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@juryza/ui/components/ui/tooltip";

import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { hueOf, pluralize } from "@/lib/format";
import { submissionsAreOpen } from "@/lib/phase";
import { useEvent } from "@/lib/queries";

import { CreateTeamDialog, eventTeamsKey } from "../create-team-dialog";

/**
 * Team finder: every team in the event with its members and open seats, so
 * solo participants can find a team that is looking for people.
 */

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  lookingForMembers: boolean;
  createdAt: string;
  projectId: string | null;
  members: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    role: string;
  }[];
}

export default function EventTeamsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: ev } = useEvent(slug);
  const [lookingOnly, setLookingOnly] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: eventTeamsKey(slug),
    queryFn: () => api.get<{ maxTeamSize: number; teams: TeamRow[] }>(`/api/events/${slug}/teams`),
  });

  const max = data?.maxTeamSize ?? 0;
  const teams = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.teams ?? []).filter(
      (t) =>
        (!lookingOnly || (t.lookingForMembers && t.members.length < max)) &&
        (!needle ||
          t.name.toLowerCase().includes(needle) ||
          t.description?.toLowerCase().includes(needle) ||
          t.members.some((m) => m.name.toLowerCase().includes(needle)))
    );
  }, [data, lookingOnly, q, max]);

  const open = ev ? submissionsAreOpen(ev.event) : false;
  const canCreate = open && ev?.event.workflow !== "innolab" && ev?.viewer && !ev.viewer.team;
  const looking =
    data?.teams.filter((t) => t.lookingForMembers && t.members.length < data.maxTeamSize).length ??
    0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Teams</h2>
          <p className="text-muted-foreground text-sm">
            {data
              ? `${pluralize(data.teams.length, "team")} · ${looking} looking for members · up to ${data.maxTeamSize} per team`
              : "Find people to build with."}
          </p>
        </div>
        {canCreate ? (
          <CreateTeamDialog
            slug={slug}
            trigger={
              <Button>
                <UsersRound /> Create a team
              </Button>
            }
          />
        ) : ev?.viewer?.team ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/teams/${ev.viewer.team.id}`} />}
          >
            Your team: {ev.viewer.team.name} <ArrowRight />
          </Button>
        ) : !ev?.viewer && open ? (
          <Button
            nativeButton={false}
            render={<Link href={`/signup?next=${encodeURIComponent(`/e/${slug}/teams`)}`} />}
          >
            <UserPlus /> Sign up to create a team
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams or people…"
            aria-label="Search teams"
          />
        </InputGroup>
        <Label className="gap-2.5 font-normal">
          <Switch checked={lookingOnly} onCheckedChange={setLookingOnly} />
          Looking for members only
        </Label>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load teams</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <Empty className="border py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>{data.teams.length ? "No teams match" : "No teams yet"}</EmptyTitle>
            <EmptyDescription>
              {data.teams.length
                ? "Try clearing the search or the “looking for members” filter."
                : open
                  ? "Be the first — start a team and share the invite link."
                  : "No teams were formed for this event."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && !data.teams.length && (
            <EmptyContent>
              <CreateTeamDialog slug={slug} trigger={<Button>Create a team</Button>} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.id} t={t} slug={slug} max={data.maxTeamSize} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({ t, slug, max }: { t: TeamRow; slug: string; max: number }) {
  const seats = Math.max(0, max - t.members.length);
  const hue = hueOf(t.name);
  return (
    <Card className="gap-0 pb-0">
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, oklch(0.65 0.16 ${hue}), oklch(0.48 0.17 ${(hue + 40) % 360}))`,
            }}
            aria-hidden
          >
            {t.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/teams/${t.id}`} className="block truncate font-semibold hover:underline">
              {t.name}
            </Link>
            <p className="text-muted-foreground text-xs">
              {t.members.length}/{max} members ·{" "}
              {seats === 0 ? "full" : `${pluralize(seats, "seat")} left`}
            </p>
          </div>
          {t.lookingForMembers && seats > 0 && <Badge>Looking</Badge>}
        </div>
        {t.description ? (
          <p className="text-muted-foreground line-clamp-3 text-sm">{t.description}</p>
        ) : (
          <p className="text-muted-foreground/70 text-sm italic">No description.</p>
        )}
        <div className="mt-auto flex items-center gap-2">
          <div className="flex -space-x-2">
            {t.members.map((m) => (
              <Tooltip key={m.id}>
                <TooltipTrigger
                  render={
                    m.username ? (
                      <Link href={`/u/${m.username}`} className="rounded-full" />
                    ) : (
                      <span className="rounded-full" />
                    )
                  }
                >
                  <UserAvatar name={m.name} image={m.image} className="ring-card size-8 ring-2" />
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1">
                  {m.role === "owner" && <Crown className="size-3" />}
                  {m.name}
                </TooltipContent>
              </Tooltip>
            ))}
            {Array.from({ length: Math.min(seats, 3) }, (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: empty seat placeholders
                key={i}
                className="border-muted-foreground/30 bg-card ring-card size-8 rounded-full border border-dashed ring-2"
                aria-hidden
              />
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="mt-4 justify-between gap-2 py-3">
        {t.projectId ? (
          <Link
            href={`/e/${slug}/projects/${t.projectId}`}
            className="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <FolderCheck className="size-4" /> View project
          </Link>
        ) : (
          <span className="text-muted-foreground text-sm">No submission yet</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<Link href={`/teams/${t.id}`} />}
        >
          Details <ArrowRight />
        </Button>
      </CardFooter>
    </Card>
  );
}
