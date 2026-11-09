"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderKanban,
  Gavel,
  MessageSquare,
  Package,
  ScrollText,
  Shuffle,
  Trophy,
  Upload,
  Users,
  UsersRound,
  Vote,
} from "lucide-react";
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
import { Spinner } from "@juryza/ui/components/ui/spinner";

import { PageHeader, Section } from "@/components/page";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/**
 * Import & export: per-dataset CSV/JSON downloads at every stage of the event,
 * the full portable bundle (fixtures-compatible), and importing a bundle or a
 * DOGFOOD fixtures.json into a brand-new draft event. Every download is audited.
 */

const DATASETS: {
  key: string;
  label: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "participants",
    label: "Participants",
    body: "Everyone registered, with team and registration date.",
    icon: Users,
  },
  { key: "teams", label: "Teams", body: "Teams with their members and project.", icon: UsersRound },
  {
    key: "projects",
    label: "Projects",
    body: "Every project with links, tags and status.",
    icon: FolderKanban,
  },
  {
    key: "assignments",
    label: "Assignments",
    body: "Judge → project pairs and whether each was scored.",
    icon: Shuffle,
  },
  {
    key: "scores",
    label: "Scores",
    body: "Raw per-criterion marks from each judge — the audit source.",
    icon: Gavel,
  },
  {
    key: "results",
    label: "Results",
    body: "Raw and normalized means, ranks, votes and awards.",
    icon: Trophy,
  },
  {
    key: "votes",
    label: "Votes",
    body: "Community votes with pseudonymous voter keys.",
    icon: Vote,
  },
  {
    key: "comments",
    label: "Comments",
    body: "Public discussion on project pages.",
    icon: MessageSquare,
  },
  {
    key: "audit",
    label: "Audit log",
    body: "Every privileged action, who did it and from where.",
    icon: ScrollText,
  },
];

interface ImportReport {
  eventId: string;
  slug: string;
  created: Record<string, number>;
  skipped: string[];
}

export default function DataPage() {
  const { slug } = useParams<{ slug: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; body: unknown } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const url = (dataset: string, format: "csv" | "json") =>
    `/api/events/${slug}/export?dataset=${dataset}&format=${format}`;

  const importer = useMutation({
    mutationFn: (body: unknown) => api.post<ImportReport>("/api/events/import", body),
    onSuccess: (res) => {
      setReport(res);
      toast.success("Event imported as a draft");
    },
    onError: (e) => toast.error(e.message),
  });

  const pick = async (f: File | undefined) => {
    setReport(null);
    setParseError(null);
    setFile(null);
    if (!f) return;
    try {
      setFile({ name: f.name, body: JSON.parse(await f.text()) });
    } catch {
      setParseError(`${f.name} isn't valid JSON.`);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Import & export"
        description="Your data is yours: download any part of the event at any stage, or move a whole event between instances."
      />

      <Section
        title="Export datasets"
        description="CSV opens in any spreadsheet (formula-safe); JSON is an array of records."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {DATASETS.map((d) => (
            <Card key={d.key} className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <d.icon className="text-muted-foreground size-4" /> {d.label}
                </CardTitle>
                <CardDescription className="text-xs">{d.body}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto gap-2 px-4">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={url(d.key, "csv")} download />}
                >
                  <FileSpreadsheet /> CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={url(d.key, "json")} download />}
                >
                  <FileJson /> JSON
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4" /> Full event bundle
            </CardTitle>
            <CardDescription>
              One JSON file with the event, rubric, prizes, judges, teams, projects, scores and
              pairwise comparisons. It uses the same shape as the DOGFOOD{" "}
              <code className="font-mono">fixtures.json</code>, so it round-trips: export here,
              import on another Juryza instance.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              nativeButton={false}
              render={<a href={`/api/events/${slug}/bundle`} download />}
            >
              <Download /> Download bundle
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4" /> Import an event
            </CardTitle>
            <CardDescription>
              Accepts a Juryza bundle or a DOGFOOD <code className="font-mono">fixtures.json</code>.
              It creates a <span className="text-foreground">new draft event</span> you own — this
              event is not changed. People are matched by email; clashing ids are re-minted.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Choose a JSON file to import"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files[0]);
              }}
              className="hover:bg-muted/40 focus-visible:ring-ring/50 flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center outline-none focus-visible:ring-3"
            >
              <FileJson className="text-muted-foreground size-6" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choose or drop a .json file"}
              </span>
              <span className="text-muted-foreground text-xs">
                {file ? "Ready to import" : "Nothing is uploaded until you press Import"}
              </span>
            </button>
            {parseError && <p className="text-destructive text-sm">{parseError}</p>}
          </CardContent>
          <CardFooter>
            <Button
              disabled={!file || importer.isPending}
              onClick={() => file && importer.mutate(file.body)}
            >
              {importer.isPending ? <Spinner /> : <Upload />} Import as new event
            </Button>
          </CardFooter>
        </Card>
      </div>

      {report && (
        <Alert>
          <CheckCircle2 className="text-success" />
          <AlertTitle>Imported into a new draft event</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(report.created).map(([k, n]) => (
                <Badge key={k} variant="secondary" className="capitalize tabular-nums">
                  {formatNumber(n)} {k}
                </Badge>
              ))}
            </div>
            {report.skipped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  <ClipboardList className="mr-1 inline size-3.5" />
                  {report.skipped.length} item(s) skipped
                </summary>
                <ul className="text-muted-foreground mt-2 flex max-h-48 list-disc flex-col gap-0.5 overflow-y-auto pl-5 text-xs">
                  {[...new Set(report.skipped)].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            <Button
              size="sm"
              className="self-start"
              nativeButton={false}
              render={<Link href={`/manage/${report.slug}`} />}
            >
              Open /manage/{report.slug} <ArrowRight />
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
