"use client";

/**
 * /manage/<slug>/tracks — rewards editor. Event tracks are disabled for the
 * Innovation Lab product, while overall and community rewards remain available.
 */

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Textarea } from "@juryza/ui/components/ui/textarea";
import { cn } from "@juryza/ui/lib/utils";

import { api } from "@/lib/api";
import { EVENT_REWARDS_ENABLED } from "@/lib/platform";
import { type EventDetail, eventKey, useEvent } from "@/lib/queries";
import type { Json, Prize } from "@/lib/types";

type Kind = "overall" | "community";
interface PrizeRow {
  key: string;
  kind: Kind;
  name: string;
  amount: string;
  rank: number;
  description: string;
}

let seq = 0;
const newKey = () => `new-${++seq}`;

const toPrizeRows = (prizes: Json<Prize>[]): PrizeRow[] =>
  prizes.map((p) => ({
    key: p.id,
    kind: p.kind as Kind,
    name: p.name,
    amount: p.amount ?? "",
    rank: p.rank,
    description: p.description ?? "",
  }));

const strip = <T extends { key: string }>(rows: T[]) =>
  JSON.stringify(rows.map(({ key: _k, ...r }) => r));

export default function TracksPrizesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useEvent(slug);
  if (!EVENT_REWARDS_ENABLED) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trophy />
          </EmptyMedia>
          <EmptyTitle>Récompenses prévues ultérieurement</EmptyTitle>
          <EmptyDescription>
            Pour l’instant, le projet classé premier et les portraits de son équipe apparaissent
            automatiquement dans le Wall of Fame après la publication des résultats.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  return <PrizesEditor key={`p-${data.event.id}`} slug={slug} detail={data} />;
}

const KIND_LABEL: Record<Kind, string> = {
  overall: "Overall",
  community: "Community",
};

function PrizesEditor({ slug, detail }: { slug: string; detail: EventDetail }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(() => toPrizeRows(detail.prizes));
  const [rows, setRows] = useState(saved);
  const dirty = strip(rows) !== strip(saved);
  const invalid = rows.some((r) => !r.name.trim() || !(r.rank >= 1 && r.rank <= 50));

  const save = useMutation({
    mutationFn: () =>
      api.put<{ prizes: Json<Prize>[] }>(`/api/events/${slug}/prizes`, {
        prizes: rows.map((r) => ({
          kind: r.kind,
          trackId: null,
          name: r.name.trim(),
          amount: r.amount.trim() || null,
          rank: r.rank,
          description: r.description.trim() || null,
        })),
      }),
    onSuccess: async (res) => {
      const fresh = toPrizeRows(res.prizes);
      setSaved(fresh);
      setRows(fresh);
      toast.success("Prizes saved");
      await queryClient.invalidateQueries({ queryKey: eventKey(slug) });
    },
    onError: (e) => toast.error(e.message),
  });

  const update = (key: string, patch: Partial<PrizeRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () =>
    setRows((rs) => [
      ...rs,
      {
        key: newKey(),
        kind: "overall",
        name: "",
        amount: "",
        rank: rs.filter((r) => r.kind === "overall").length + 1,
        description: "",
      },
    ]);

  return (
    <Card className={cn(dirty && "ring-primary/40 ring-2")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4" /> Prizes
          {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
        </CardTitle>
        <CardDescription>
          Awarded by overall judged rank or by the community vote. Winners are computed from the
          results.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={add} disabled={rows.length >= 40}>
            <Plus /> Add prize
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <li key={r.key} className="grid gap-3 rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[9rem_12rem_minmax(0,1fr)_8rem_5rem_auto]">
                  <Select
                    value={r.kind}
                    items={KIND_LABEL}
                    onValueChange={(v) =>
                      v &&
                      update(r.key, {
                        kind: v as Kind,
                      })
                    }
                  >
                    <SelectTrigger className="w-full" aria-label="Prize kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-muted-foreground flex h-8 items-center text-xs">
                    {r.kind === "overall" ? "Across all projects" : "Most community votes"}
                  </div>
                  <Input
                    value={r.name}
                    maxLength={80}
                    placeholder="Prize name, e.g. Grand prize"
                    aria-label={`Prize ${i + 1} name`}
                    aria-invalid={!r.name.trim()}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                  />
                  <Input
                    value={r.amount}
                    maxLength={40}
                    placeholder="1 000 DZcoin"
                    aria-label={`Prize ${i + 1} amount`}
                    onChange={(e) => update(r.key, { amount: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={Number.isNaN(r.rank) ? "" : r.rank}
                    aria-label={`Prize ${i + 1} rank`}
                    title="Rank (1 = first place)"
                    className="tabular-nums"
                    onChange={(e) => update(r.key, { rank: e.target.valueAsNumber })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${r.name || "prize"}`}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Textarea
                  value={r.description}
                  maxLength={400}
                  rows={2}
                  placeholder="Description (optional) — what winners receive, sponsor, eligibility…"
                  aria-label={`Prize ${i + 1} description`}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  className="min-h-0"
                />
              </li>
            ))}
          </ul>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>No prizes yet</EmptyTitle>
              <EmptyDescription>
                Prizes show on the event page and decide who gets winner certificates.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={add}>
                <Plus /> Add a prize
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t">
        <p className="text-muted-foreground text-sm">
          {invalid
            ? "Every prize needs a name and a rank between 1 and 50."
            : dirty
              ? "You have unsaved changes."
              : "All changes saved."}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setRows(saved)} disabled={save.isPending}>
              Discard
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={!dirty || invalid || save.isPending}>
            {save.isPending ? <Spinner /> : <Save />} Save prizes
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
