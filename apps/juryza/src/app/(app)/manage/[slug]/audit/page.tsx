"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Braces, Download, ScrollText, Search, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import { Card } from "@juryza/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@juryza/ui/components/ui/input-group";
import { Label } from "@juryza/ui/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@juryza/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Switch } from "@juryza/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@juryza/ui/components/ui/table";
import { cn } from "@juryza/ui/lib/utils";

import { PageHeader } from "@/components/page";
import { api } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { AuditLog, Json } from "@/lib/types";

/**
 * Audit log: every privileged or security-relevant action on this event,
 * newest first. Filter by action family (server-side prefix), search the
 * loaded page client-side, page back with "Load older", and export as CSV.
 * Refused or blocked actions are highlighted.
 */

type Entry = Json<AuditLog>;
interface Page {
  entries: Entry[];
  nextBefore: string | null;
}

const FAMILIES: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "score", label: "Scores" },
  { value: "assignments", label: "Assignments" },
  { value: "judge", label: "Judges" },
  { value: "rubric", label: "Rubric" },
  { value: "results", label: "Results" },
  { value: "certificates", label: "Certificates" },
  { value: "project", label: "Projects" },
  { value: "submission", label: "Submissions" },
  { value: "vote", label: "Votes" },
  { value: "voter", label: "Voter verification" },
  { value: "pairwise", label: "Pairwise" },
  { value: "team", label: "Teams" },
  { value: "registration", label: "Registrations" },
  { value: "comment", label: "Comments" },
  { value: "export", label: "Exports" },
  { value: "webhook", label: "Webhooks" },
  { value: "event", label: "Event settings" },
];

/** Refusals and blocks — the backend saying no. */
const SECURITY = new Set([
  "judge.scores.denied",
  "vote.blocked.ip_cap",
  "submission.rejected.closed",
]);
const isSecurity = (action: string) =>
  SECURITY.has(action) || /\.(denied|blocked|rejected)(\.|$)/.test(action);

const LABELS: Record<string, string> = {
  "announcement.deleted": "Deleted an announcement",
  "announcement.posted": "Posted an announcement",
  "assignments.cleared": "Released unscored assignments",
  "assignments.generated": "Generated assignments",
  "certificates.issued": "Issued certificates",
  "comment.posted": "Commented on a project",
  "event.created": "Created the event",
  "event.deleted": "Deleted the event",
  "event.imported": "Imported the event",
  "event.updated": "Updated event settings",
  "export.bundle": "Downloaded the event bundle",
  "export.downloaded": "Exported a dataset",
  "judge.added": "Added a judge",
  "judge.invite_revoked": "Revoked a judge invitation",
  "judge.invited": "Invited a judge",
  "judge.joined": "Joined the judging panel",
  "judge.removed": "Removed a judge",
  "judge.scores.denied": "Scoring refused",
  "judge.tracks_updated": "Changed a judge's tracks",
  "pairwise.compared": "Compared two projects",
  "prizes.updated": "Updated prizes",
  "project.created": "Started a project",
  "project.deleted": "Deleted a project",
  "project.submitted": "Submitted a project",
  "project.updated": "Edited a project",
  "registration.created": "Registered",
  "registration.withdrawn": "Withdrew registration",
  "results.published": "Published results",
  "results.unpublished": "Unpublished results",
  "rubric.updated": "Changed the rubric",
  "score.saved": "Saved a score",
  "submission.rejected.closed": "Submission refused — deadline passed",
  "team.created": "Created a team",
  "team.disbanded": "Disbanded a team",
  "team.invite_reset": "Reset a team invite code",
  "team.joined": "Joined a team",
  "project.join_requested": "Requested to join a project",
  "project.join_approved": "Approved a project join request",
  "project.join_rejected": "Rejected a project join request",
  "project.join_cancelled": "Cancelled a project join request",
  "team.updated": "Updated a team",
  "tracks.updated": "Updated tracks",
  "vote.blocked.ip_cap": "Vote blocked — too many voters on one network",
  "vote.cast": "Cast a vote",
  "voter.code_sent": "Sent a voter verification code",
  "voter.verified": "Verified a voter email",
  "webhook.created": "Added a webhook",
  "webhook.deleted": "Deleted a webhook",
  "webhook.updated": "Updated a webhook",
};
const label = (action: string) =>
  LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function AuditPage() {
  const { slug } = useParams<{ slug: string }>();
  const [family, setFamily] = useState("all");
  const [q, setQ] = useState("");
  const [securityOnly, setSecurityOnly] = useState(false);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["audit", slug, family],
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: "100" });
        if (family !== "all") params.set("action", family);
        if (pageParam) params.set("before", pageParam);
        return api.get<Page>(`/api/events/${slug}/audit?${params}`);
      },
      getNextPageParam: (last) => last.nextBefore,
    });

  const all = data?.pages.flatMap((p) => p.entries) ?? [];
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (e) =>
      (!securityOnly || isSecurity(e.action)) &&
      (!needle ||
        [
          e.action,
          label(e.action),
          e.actorName,
          e.actorRole,
          e.target,
          e.ipAddress,
          e.detail && JSON.stringify(e.detail),
        ]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(needle)))
  );
  const flagged = all.filter((e) => isSecurity(e.action)).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Every privileged action on this event — who, what, when and from where. Exports and refused attempts are recorded too."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/api/events/${slug}/export?dataset=audit&format=csv`} download />}
          >
            <Download /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Select value={family} onValueChange={(v) => setFamily(v ?? "all")}>
          <SelectTrigger className="w-full md:w-52" aria-label="Filter by action">
            <SelectValue>
              {(v: string) => FAMILIES.find((f) => f.value === v)?.label ?? v}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup className="md:max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search actor, target, IP, detail…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search loaded entries"
          />
        </InputGroup>
        <Label className="flex items-center gap-2 text-sm font-normal md:ml-auto">
          <Switch checked={securityOnly} onCheckedChange={setSecurityOnly} />
          Refusals &amp; blocks only
          {flagged > 0 && (
            <Badge className="bg-warning text-warning-foreground tabular-nums">{flagged}</Badge>
          )}
        </Label>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load the audit log</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText />
            </EmptyMedia>
            <EmptyTitle>No matching entries</EmptyTitle>
            <EmptyDescription>
              {all.length
                ? "Try a different filter or search."
                : "Actions on this event will be recorded here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="pr-4">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const sec = isSecurity(e.action);
                  return (
                    <TableRow key={e.id} className={cn(sec && "bg-warning/10 hover:bg-warning/15")}>
                      <TableCell className="pl-4 whitespace-nowrap">
                        <p className="text-sm tabular-nums">{formatDateTime(e.createdAt)}</p>
                        <p className="text-muted-foreground text-xs">{relativeTime(e.createdAt)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {e.actorName ?? "Anonymous"}
                          </span>
                          {e.actorRole && (
                            <Badge variant="outline" className="capitalize">
                              {e.actorRole}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-sm">
                            {sec && (
                              <Badge className="bg-warning text-warning-foreground">
                                <ShieldAlert /> Refused
                              </Badge>
                            )}
                            {label(e.action)}
                          </span>
                          <code className="text-muted-foreground font-mono text-xs">
                            {e.action}
                          </code>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-44">
                        {e.target ? (
                          <code className="block truncate font-mono text-xs" title={e.target}>
                            {e.target}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.detail && Object.keys(e.detail).length > 0 ? (
                          <Popover>
                            <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
                              <Braces /> {Object.keys(e.detail).length} field
                              {Object.keys(e.detail).length === 1 ? "" : "s"}
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
                              <pre className="bg-muted max-h-72 overflow-auto rounded-md p-3 font-mono text-xs">
                                {JSON.stringify(e.detail, null, 2)}
                              </pre>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <code className="font-mono text-xs">{e.ipAddress ?? "—"}</code>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {all.length} entr{all.length === 1 ? "y" : "ies"} loaded
          {needle || securityOnly ? ` · ${rows.length} shown` : ""}. Search covers loaded entries
          only.
        </p>
        {hasNextPage && (
          <Button variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage && <Spinner />} Load older
          </Button>
        )}
      </div>
    </div>
  );
}
