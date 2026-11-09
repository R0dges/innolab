"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleDashed,
  CircleDot,
  Code2,
  ExternalLink,
  Eye,
  FolderGit2,
  Globe,
  ImageIcon,
  Link2,
  Lock,
  MoreHorizontal,
  Rocket,
  Tags,
  Trash2,
  Trophy,
  Undo2,
  UsersRound,
  Video,
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
} from "@juryza/ui/components/ui/alert-dialog";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@juryza/ui/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Input } from "@juryza/ui/components/ui/input";
import { Kbd } from "@juryza/ui/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@juryza/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Separator } from "@juryza/ui/components/ui/separator";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@juryza/ui/components/ui/tooltip";
import { cn } from "@juryza/ui/lib/utils";

import { RichContent } from "@/components/editor/rich-content";
import { RichEditor } from "@/components/editor/rich-editor";
import { coverStyle } from "@/components/event-bits";
import { AvatarStack } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatDateTime, hueOf, relativeTime } from "@/lib/format";
import { EVENT_TRACKS_ENABLED } from "@/lib/platform";
import { useEvent } from "@/lib/queries";
import { isEmptyDoc } from "@/lib/rich-text";
import type { Json, Project, RichDoc, Track } from "@/lib/types";

import { TagInput } from "./tag-input";

/**
 * The project editor — a Notion-style document for a team's submission:
 * cover, big title, a properties block (status, event, team, track, tags,
 * links, deadline) and a block editor for the write-up. Every change autosaves
 * (debounced PATCH of only the changed fields); ⌘S saves now. After the
 * deadline the page turns read-only — the API refuses edits either way.
 */

interface ProjectData {
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

interface Fields {
  title: string;
  tagline: string;
  trackId: string | null;
  techTags: string[];
  repoUrl: string;
  liveUrl: string;
  videoUrl: string;
  thumbnailUrl: string;
  content: RichDoc | null;
}
type Key = keyof Fields;
const KEYS: Key[] = [
  "title",
  "tagline",
  "trackId",
  "techTags",
  "repoUrl",
  "liveUrl",
  "videoUrl",
  "thumbnailUrl",
  "content",
];
const URL_KEYS = new Set<Key>(["repoUrl", "liveUrl", "videoUrl", "thumbnailUrl"]);

const fieldsOf = (p: Json<Project>): Fields => ({
  title: p.title,
  tagline: p.tagline ?? "",
  trackId: p.trackId,
  techTags: p.techTags ?? [],
  repoUrl: p.repoUrl ?? "",
  liveUrl: p.liveUrl ?? "",
  videoUrl: p.videoUrl ?? "",
  thumbnailUrl: p.thumbnailUrl ?? "",
  content: (p.content as RichDoc | null) ?? null,
});

function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}
const urlProblem = (v: string) =>
  v.trim() && !isHttpUrl(v.trim()) ? "Enter a full link starting with https://" : null;

/** The fields that differ from what the server has and can be sent as they are. */
function changes(now: Fields, saved: Fields) {
  const patch: Record<string, unknown> = {};
  for (const k of KEYS) {
    if (JSON.stringify(now[k]) === JSON.stringify(saved[k])) continue;
    const v = now[k];
    if (k === "title") {
      if (now.title.trim()) patch.title = now.title.trim();
    } else if (k === "tagline") {
      patch.tagline = now.tagline.trim() || null;
    } else if (URL_KEYS.has(k)) {
      const s = (v as string).trim();
      if (!urlProblem(s)) patch[k] = s || null;
    } else {
      patch[k] = v;
    }
  }
  return patch;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<ProjectData>(`/api/projects/${id}`),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (isLoading) return <EditorSkeleton />;
  if (error || !data) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleDashed />
          </EmptyMedia>
          <EmptyTitle>Project not found</EmptyTitle>
          <EmptyDescription>
            {error?.message ?? "It may have been deleted, or you're not on its team."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/projects" />}>
            <ArrowLeft /> My projects
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  return <ProjectDocument key={data.project.id} data={data} />;
}

function ProjectDocument({ data }: { data: ProjectData }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = data.project.id;
  const canEdit = data.viewer.canEdit;
  const { data: eventDetail } = useEvent(data.event.slug);
  const tracks = eventDetail?.tracks ?? (data.track ? [data.track] : []);

  const [fields, setFields] = useState<Fields>(() => fieldsOf(data.project));
  const [saved, setSaved] = useState<Fields>(() => fieldsOf(data.project));
  const [status, setStatus] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [projectStatus, setProjectStatus] = useState(data.project.status);
  const [now, setNow] = useState(() => Date.now());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<null | "submit" | "withdraw" | "delete">(null);

  // Refs mirror state for the async save loop, which outlives renders.
  const latest = useRef(fields);
  const savedRef = useRef(saved);
  const inflight = useRef(false);
  const queued = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const taglineRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    latest.current = fields;
  }, [fields]);

  // Dynamically auto-resize textareas so neither displays a scrollbar and text is fully visible
  useEffect(() => {
    const el = titleRef.current;
    if (el && fields.title !== undefined) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [fields.title]);

  useEffect(() => {
    const el = taglineRef.current;
    if (el && fields.tagline !== undefined) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [fields.tagline]);

  const set = <K extends Key>(key: K, value: Fields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const flush = useCallback(
    async (extra?: { submit: boolean }): Promise<Json<Project> | null> => {
      if (inflight.current && !extra) {
        queued.current = true;
        return null;
      }
      const snapshot = latest.current;
      const patch = changes(snapshot, savedRef.current);
      if (!Object.keys(patch).length && !extra) return null;
      inflight.current = true;
      setStatus("saving");
      try {
        const res = await api.patch<{ project: Json<Project> }>(`/api/projects/${projectId}`, {
          ...patch,
          ...extra,
        });
        const next = { ...savedRef.current };
        for (const k of Object.keys(patch) as Key[])
          (next as Record<Key, unknown>)[k] = snapshot[k];
        savedRef.current = next;
        setSaved(next);
        setStatus("saved");
        setSavedAt(Date.now());
        setProjectStatus(res.project.status);
        return res.project;
      } catch (e) {
        setStatus("error");
        toast.error(e instanceof Error ? e.message : "Could not save");
        if (extra) throw e;
        return null;
      } finally {
        inflight.current = false;
        if (queued.current) {
          queued.current = false;
          void flush();
        }
      }
    },
    [projectId]
  );

  const pending = Object.keys(changes(fields, saved)).length > 0;
  const dirty = KEYS.some((k) => JSON.stringify(fields[k]) !== JSON.stringify(saved[k]));

  // Debounced autosave: every edit restarts the timer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fields` is the trigger, read through `latest`
  useEffect(() => {
    if (!canEdit || !pending) return;
    const t = setTimeout(() => void flush(), 800);
    return () => clearTimeout(t);
  }, [fields, pending, canEdit, flush]);

  // ⌘S / Ctrl+S saves immediately.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (Object.keys(changes(latest.current, savedRef.current)).length) {
          void flush();
        } else {
          setStatus("saved");
          setSavedAt(Date.now());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, flush]);

  // Warn before closing the tab with unsaved edits; save on in-app navigation.
  useEffect(() => {
    if (!dirty && status !== "saving") return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty, status]);
  useEffect(() => () => void flush(), [flush]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const submitted = projectStatus === "submitted";
  const deadline = new Date(data.event.submissionsClose).getTime();
  const hue = hueOf(projectId);
  const cover =
    fields.thumbnailUrl.trim() && isHttpUrl(fields.thumbnailUrl.trim())
      ? fields.thumbnailUrl.trim()
      : null;
  const publicHref = `/e/${data.event.slug}/projects/${projectId}`;
  const canDelete = data.viewer.manager || (data.viewer.owner && data.viewer.submissionsOpen);

  const checklist = [
    { label: "A title", ok: fields.title.trim().length > 0, required: true },
    { label: "A one-line tagline", ok: fields.tagline.trim().length > 0 },
    ...(EVENT_TRACKS_ENABLED && tracks.length
      ? [{ label: "A track", ok: fields.trackId !== null }]
      : []),
    { label: "A write-up for judges", ok: !isEmptyDoc(fields.content) },
    { label: "A repository link", ok: isHttpUrl(fields.repoUrl.trim()) },
    {
      label: "A live demo or video",
      ok: isHttpUrl(fields.liveUrl.trim()) || isHttpUrl(fields.videoUrl.trim()),
    },
  ];
  const missing = checklist.filter((c) => !c.ok);

  const submit = async () => {
    setBusy("submit");
    try {
      await flush({ submit: true });
      setSubmitOpen(false);
      toast.success("Project submitted", {
        description: "You can keep editing until the deadline.",
      });
      void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
    } catch {
      // flush already reported the error
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    setBusy("withdraw");
    try {
      await flush({ submit: false });
      toast.success("Moved back to draft", {
        description: "Judges won't see it until you submit again.",
      });
      void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
    } catch {
      // reported by flush
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.delete(`/api/projects/${projectId}`);
      savedRef.current = latest.current;
      setSaved(latest.current);
      toast.success("Project deleted");
      void queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      queryClient.removeQueries({ queryKey: ["project", projectId] });
      router.push("/projects");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
      setBusy(null);
    }
  };

  return (
    <div className="-mt-4 flex flex-col sm:-mt-6 lg:-mt-8">
      {/* Top bar */}
      <div className="bg-background/85 sticky top-14 z-20 -mx-4 flex h-12 items-center gap-2 border-b px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          nativeButton={false}
          render={<Link href="/projects" />}
        >
          <ArrowLeft /> <span className="hidden sm:inline">My projects</span>
        </Button>
        <span className="text-muted-foreground hidden max-w-48 truncate text-sm md:inline">
          {data.event.name} / {fields.title.trim() || "Untitled"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {canEdit && (
            <SaveIndicator
              status={status}
              savedAt={savedAt}
              pending={dirty}
              now={now}
              onRetry={() => void flush()}
            />
          )}
          {submitted ? (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<a href={publicHref} target="_blank" rel="noreferrer" />}
            >
              <Eye /> <span className="hidden sm:inline">Preview</span>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Button variant="ghost" size="sm" disabled>
                  <Eye /> <span className="hidden sm:inline">Preview</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>The public page goes live once you submit</TooltipContent>
            </Tooltip>
          )}
          {canEdit &&
            (submitted ? (
              <Button variant="outline" size="sm" onClick={withdraw} disabled={busy !== null}>
                {busy === "withdraw" ? <Spinner /> : <Undo2 />} Withdraw to draft
              </Button>
            ) : (
              <Button size="sm" onClick={() => setSubmitOpen(true)} disabled={busy !== null}>
                <Rocket /> Submit project
              </Button>
            ))}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}${publicHref}`);
                  toast.success("Public link copied");
                }}
              >
                <Link2 /> Copy public link
              </DropdownMenuItem>
              {data.team && (
                <DropdownMenuItem render={<Link href={`/teams/${data.team.id}`} />}>
                  <UsersRound /> Open team
                </DropdownMenuItem>
              )}
              <DropdownMenuItem render={<Link href={`/e/${data.event.slug}`} />}>
                <Trophy /> Event page
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 /> {submitted ? "Delete project" : "Delete draft"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cover */}
      <div
        className="group/cover relative -mx-4 h-36 sm:-mx-6 sm:h-48 lg:-mx-8"
        style={cover ? undefined : coverStyle(hue)}
      >
        {/* biome-ignore lint/performance/noImgElement: arbitrary user-supplied URL, not optimizable */}
        {cover && <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />}
        {canEdit && (
          <div className="absolute right-4 bottom-3 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/cover:opacity-100 sm:group-focus-within/cover:opacity-100">
            <CoverPicker value={fields.thumbnailUrl} onChange={(v) => set("thumbnailUrl", v)} />
          </div>
        )}
      </div>

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 pt-10 pb-24 sm:px-4">
        {!canEdit && (
          <Alert>
            <Lock />
            <AlertTitle>This project is locked</AlertTitle>
            <AlertDescription>
              {data.viewer.member
                ? `The submission deadline passed ${relativeTime(data.event.submissionsClose, now)}. What you see is what judges review.`
                : "Only the team can edit this project, and only before the submission deadline."}
            </AlertDescription>
          </Alert>
        )}

        {/* Title & tagline */}
        <div className="flex flex-col gap-2">
          {canEdit ? (
            <>
              <textarea
                ref={titleRef}
                value={fields.title}
                onChange={(e) => set("title", e.target.value.replace(/\n/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    taglineRef.current?.focus();
                  }
                }}
                rows={1}
                maxLength={100}
                placeholder="Untitled"
                aria-label="Project title"
                className="placeholder:text-muted-foreground/50 field-sizing-content w-full resize-none overflow-hidden bg-transparent text-[2.5rem] leading-[1.15] font-semibold tracking-tight outline-none"
              />
              <textarea
                ref={taglineRef}
                value={fields.tagline}
                onChange={(e) => set("tagline", e.target.value.replace(/\n/g, " "))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
                rows={1}
                maxLength={160}
                placeholder="Add a one-line tagline…"
                aria-label="Tagline"
                className="placeholder:text-muted-foreground/60 text-muted-foreground w-full resize-none overflow-hidden bg-transparent text-lg leading-relaxed outline-none field-sizing-content"
              />
              {!fields.title.trim() && (
                <p className="text-destructive text-xs">
                  A title is required — it won't save until you add one.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="text-[2.5rem] leading-[1.15] font-semibold tracking-tight text-balance">
                {fields.title || "Untitled"}
              </h1>
              {fields.tagline && <p className="text-muted-foreground text-lg">{fields.tagline}</p>}
            </>
          )}
        </div>

        {/* Properties */}
        <div className="flex flex-col gap-0.5">
          <Prop icon={CircleDot} label="Status">
            <Badge variant={submitted ? "default" : "secondary"} className="gap-1">
              {submitted ? <Check /> : <CircleDashed />}
              {submitted ? "Submitted" : "Draft"}
            </Badge>
            {submitted && data.project.submittedAt && (
              <span className="text-muted-foreground ml-2 text-xs">
                {relativeTime(data.project.submittedAt, now)}
              </span>
            )}
          </Prop>
          <Prop icon={Trophy} label="Event">
            <Link
              href={`/e/${data.event.slug}`}
              className="truncate underline-offset-4 hover:underline"
            >
              {data.event.name}
            </Link>
          </Prop>
          <Prop icon={UsersRound} label="Team">
            {data.team ? (
              <Link href={`/teams/${data.team.id}`} className="flex min-w-0 items-center gap-2">
                <AvatarStack people={data.team.members} max={5} />
                <span className="truncate underline-offset-4 hover:underline">
                  {data.team.name}
                </span>
              </Link>
            ) : (
              <span className="text-muted-foreground">No team</span>
            )}
          </Prop>
          {EVENT_TRACKS_ENABLED && (
            <Prop icon={Tags} label="Track" interactive={false}>
              {canEdit && tracks.length > 0 ? (
                <Select
                  items={[
                    { value: null, label: "No track" },
                    ...tracks.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  value={fields.trackId}
                  onValueChange={(v) => set("trackId", v)}
                >
                  <SelectTrigger
                    aria-label="Track"
                    className="hover:bg-muted/60 h-8 w-full justify-between border-0 bg-transparent! px-2 shadow-none"
                  >
                    <SelectValue
                      placeholder={<span className="text-muted-foreground">Choose a track</span>}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>No track</SelectItem>
                    {tracks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className={cn(!fields.trackId && "text-muted-foreground")}>
                  {tracks.find((t) => t.id === fields.trackId)?.name ??
                    (tracks.length ? "No track" : "This event has no tracks")}
                </span>
              )}
            </Prop>
          )}
          <Prop icon={Code2} label="Tech" interactive={canEdit}>
            {canEdit ? (
              <TagInput
                value={fields.techTags}
                onChange={(v) => set("techTags", v)}
                placeholder="Type a technology and press Enter"
                aria-label="Add a technology"
                className="w-full py-0.5"
              />
            ) : fields.techTags.length ? (
              <TagInput value={fields.techTags} onChange={() => {}} disabled className="py-0.5" />
            ) : (
              <span className="text-muted-foreground">Empty</span>
            )}
          </Prop>
          <UrlProp
            icon={FolderGit2}
            label="Repository"
            value={fields.repoUrl}
            placeholder="https://github.com/you/project"
            editable={canEdit}
            onChange={(v) => set("repoUrl", v)}
          />
          <UrlProp
            icon={Globe}
            label="Live demo"
            value={fields.liveUrl}
            placeholder="https://your-demo.app"
            editable={canEdit}
            onChange={(v) => set("liveUrl", v)}
          />
          <UrlProp
            icon={Video}
            label="Video"
            value={fields.videoUrl}
            placeholder="https://youtu.be/…"
            editable={canEdit}
            onChange={(v) => set("videoUrl", v)}
          />
          <Prop icon={CalendarClock} label="Deadline" interactive={false}>
            <span
              className={cn(
                deadline < now
                  ? "text-muted-foreground"
                  : deadline - now < 24 * 3600_000 && "text-destructive font-medium"
              )}
            >
              {deadline < now ? "Closed" : `Closes ${relativeTime(deadline, now)}`}
            </span>
            <span className="text-muted-foreground ml-2 hidden text-xs sm:inline">
              {formatDateTime(deadline)}
            </span>
          </Prop>
        </div>

        <Separator />

        {/* Write-up */}
        {canEdit ? (
          <RichEditor
            value={fields.content}
            onChange={(doc) => set("content", doc)}
            placeholder="Tell judges what you built… type / for blocks"
            className="min-h-72"
          />
        ) : (
          <RichContent
            doc={fields.content}
            empty={<p className="text-muted-foreground">No write-up yet.</p>}
          />
        )}

        {canEdit && (
          <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            Changes save automatically · <Kbd>⌘</Kbd>
            <Kbd>S</Kbd> to save now · <Kbd>/</Kbd> for blocks
          </p>
        )}
      </article>

      {/* Submit confirmation */}
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit “{fields.title.trim() || "Untitled"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {missing.length
                ? "Judges review what's here. A few recommended things are still missing:"
                : "Everything judges look for is in place. You can keep editing until the deadline."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-1.5 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                {c.ok ? (
                  <Check className="text-success size-4 shrink-0" />
                ) : (
                  <X
                    className={cn(
                      "size-4 shrink-0",
                      c.required ? "text-destructive" : "text-muted-foreground"
                    )}
                  />
                )}
                <span className={cn(!c.ok && "text-muted-foreground")}>
                  {c.label}
                  {c.required && !c.ok && " (required)"}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={submit}
              disabled={busy === "submit" || !fields.title.trim()}
            >
              {busy === "submit" ? <Spinner /> : <Rocket />}
              {missing.length > 0 && fields.title.trim() ? "Submit anyway" : "Submit project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              “{fields.title.trim() || "Untitled"}” and its write-up will be permanently removed.
              Your team stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={busy === "delete"}>
              {busy === "delete" ? <Spinner /> : <Trash2 />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({
  status,
  savedAt,
  pending,
  now,
  onRetry,
}: {
  status: SaveState;
  savedAt: number | null;
  pending: boolean;
  now: number;
  onRetry: () => void;
}) {
  let content: React.ReactNode = null;
  if (status === "saving") {
    content = (
      <>
        <Spinner className="size-3" /> Saving…
      </>
    );
  } else if (status === "error") {
    return (
      <Button variant="ghost" size="xs" className="text-destructive" onClick={onRetry}>
        Error — retry
      </Button>
    );
  } else if (pending) {
    content = (
      <>
        <span className="bg-warning size-1.5 rounded-full" /> Unsaved
      </>
    );
  } else if (savedAt) {
    content = (
      <>
        <Check className="size-3" /> Saved ·{" "}
        {now - savedAt < 60_000 ? "just now" : relativeTime(savedAt, now)}
      </>
    );
  }
  return (
    <span
      aria-live="polite"
      className="text-muted-foreground mr-1 hidden items-center gap-1.5 text-xs sm:flex"
    >
      {content}
    </span>
  );
}

function Prop({
  icon: Icon,
  label,
  children,
  interactive = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  interactive?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="text-muted-foreground flex h-8 items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "flex min-h-8 min-w-0 items-center rounded-md text-sm",
          interactive ? "hover:bg-muted/60 px-2 transition-colors" : "px-2 has-[button]:px-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function UrlProp({
  icon,
  label,
  value,
  placeholder,
  editable,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  placeholder: string;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  const problem = urlProblem(value);
  const valid = value.trim() && !problem;
  if (!editable) {
    return (
      <Prop icon={icon} label={label} interactive={false}>
        {valid ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-primary truncate underline-offset-4 hover:underline"
          >
            {value.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-muted-foreground">Empty</span>
        )}
      </Prop>
    );
  }
  return (
    <Prop icon={icon} label={label}>
      <div className="flex w-full min-w-0 flex-col">
        <div className="flex items-center gap-1">
          <input
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={problem ? true : undefined}
            className="placeholder:text-muted-foreground/60 h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {valid && (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${label.toLowerCase()}`}
              className="text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded-md"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        {problem && <p className="text-destructive pb-1.5 text-xs">{problem}</p>}
      </div>
    </Prop>
  );
}

function CoverPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const problem = urlProblem(draft);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value);
      }}
    >
      <PopoverTrigger render={<Button variant="secondary" size="sm" className="shadow-sm" />}>
        <ImageIcon /> {value ? "Change cover" : "Add cover"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (problem) return;
            onChange(draft.trim());
            setOpen(false);
          }}
        >
          <label htmlFor="cover-url" className="text-sm font-medium">
            Cover image URL
          </label>
          <Input
            id="cover-url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://…/screenshot.png"
            aria-invalid={problem ? true : undefined}
          />
          <p className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
            {problem ?? "Also used as the thumbnail in the gallery. Leave empty for a gradient."}
          </p>
          <div className="flex justify-end gap-2">
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Remove
              </Button>
            )}
            <Button type="submit" size="sm" disabled={Boolean(problem)}>
              Save cover
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function EditorSkeleton() {
  return (
    <div className="-mt-4 flex flex-col sm:-mt-6 lg:-mt-8">
      <Skeleton className="-mx-4 h-36 rounded-none sm:-mx-6 sm:h-48 lg:-mx-8" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-1 pt-10 sm:px-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    </div>
  );
}
