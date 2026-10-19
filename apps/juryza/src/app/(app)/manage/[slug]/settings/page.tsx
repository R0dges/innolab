"use client";

/**
 * /manage/<slug>/settings — details & dates. Each section saves on its own
 * with PATCH /api/events/:slug, sending only the fields that changed. Ends with
 * the visibility switch and the danger zone (delete the event).
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@juryza/ui/components/ui/field";
import { Input } from "@juryza/ui/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@juryza/ui/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@juryza/ui/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Slider } from "@juryza/ui/components/ui/slider";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Switch } from "@juryza/ui/components/ui/switch";
import { cn } from "@juryza/ui/lib/utils";

import { RichEditor } from "@/components/editor/rich-editor";
import { EventCover } from "@/components/event-bits";
import { api } from "@/lib/api";
import { eventKey, useEvent } from "@/lib/queries";
import type { Event, Json, RichDoc } from "@/lib/types";

type Mode = "online" | "in-person" | "hybrid";
type Access = "authenticated" | "email" | "open";
type VotingMode = "quadratic" | "writeup";
type Workflow = "standard" | "innolab";

interface Form {
  name: string;
  slug: string;
  tagline: string;
  mode: Mode;
  location: string;
  hue: number;
  content: RichDoc | null;
  rules: RichDoc | null;
  workflow: Workflow;
  pitchSubmissionsOpen: string;
  pitchSubmissionsClose: string;
  pitchVotingOpen: string;
  pitchVotingClose: string;
  submissionsOpen: string;
  submissionsClose: string;
  judgingClose: string;
  votingOpen: string;
  votingClose: string;
  maxTeamSize: number;
  reviewsPerProject: number;
  votingAccess: Access;
  votingEmailDomains: string;
  voteBudget: number;
  votingMode: VotingMode;
  votingShortlistSize: number;
  votingElectorateLockAt: string;
  visibility: "draft" | "published";
}
type Key = keyof Form;

const DATE_KEYS = [
  "pitchSubmissionsOpen",
  "pitchSubmissionsClose",
  "pitchVotingOpen",
  "pitchVotingClose",
  "submissionsOpen",
  "submissionsClose",
  "judgingClose",
  "votingOpen",
  "votingClose",
  "votingElectorateLockAt",
] as const;

const PROJECT_DATE_KEYS = [
  "submissionsOpen",
  "submissionsClose",
  "judgingClose",
  "votingOpen",
  "votingClose",
  "votingElectorateLockAt",
] as const;

const PITCH_KEYS = [
  "workflow",
  "pitchSubmissionsOpen",
  "pitchSubmissionsClose",
  "pitchVotingOpen",
  "pitchVotingClose",
] as const;

const toLocalInput = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function toForm(e: Json<Event>): Form {
  return {
    name: e.name,
    slug: e.slug,
    tagline: e.tagline ?? "",
    mode: e.mode as Mode,
    location: e.location ?? "",
    hue: e.hue,
    content: (e.content as RichDoc | null) ?? null,
    rules: (e.rules as RichDoc | null) ?? null,
    workflow: (e.workflow as Workflow) ?? "standard",
    pitchSubmissionsOpen: toLocalInput(e.pitchSubmissionsOpen),
    pitchSubmissionsClose: toLocalInput(e.pitchSubmissionsClose),
    pitchVotingOpen: toLocalInput(e.pitchVotingOpen),
    pitchVotingClose: toLocalInput(e.pitchVotingClose),
    submissionsOpen: toLocalInput(e.submissionsOpen),
    submissionsClose: toLocalInput(e.submissionsClose),
    judgingClose: toLocalInput(e.judgingClose),
    votingOpen: toLocalInput(e.votingOpen),
    votingClose: toLocalInput(e.votingClose),
    maxTeamSize: e.maxTeamSize,
    reviewsPerProject: e.reviewsPerProject,
    votingAccess: e.votingAccess as Access,
    votingEmailDomains: e.votingEmailDomains.join(", "),
    voteBudget: e.voteBudget,
    votingMode: (e.votingMode as VotingMode) ?? "quadratic",
    votingShortlistSize: e.votingShortlistSize ?? 0,
    votingElectorateLockAt: toLocalInput(e.votingElectorateLockAt),
    visibility: e.visibility as Form["visibility"],
  };
}

const parseDomains = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim().toLowerCase().replace(/^@/, ""))
    .filter((x) => x.length >= 3);

/** A form value as the API expects it. */
function wire(k: Key, f: Form): unknown {
  if ((DATE_KEYS as readonly string[]).includes(k)) {
    const v = f[k] as string;
    return v ? new Date(v).toISOString() : null;
  }
  if (k === "tagline" || k === "location") return (f[k] as string).trim() || null;
  if (k === "votingEmailDomains") return parseDomains(f.votingEmailDomains);
  if (k === "name") return f.name.trim();
  return f[k];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function EventSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useEvent(slug);
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }
  return <SettingsForm key={data.event.id} event={data.event} />;
}

function SettingsForm({ event }: { event: Json<Event> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<Form>(() => toForm(event));
  const [form, setForm] = useState<Form>(() => toForm(event));
  const [pending, setPending] = useState<string | null>(null);
  const slug = saved.slug;

  const set = <K extends Key>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = (keys: readonly Key[]) => keys.some((k) => !same(wire(k, form), wire(k, saved)));

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<{ event: Json<Event> }>(`/api/events/${slug}`, body),
  });

  async function save(section: string, keys: readonly Key[], override?: Partial<Form>) {
    const next = { ...form, ...override };
    const body = Object.fromEntries(
      keys.filter((k) => !same(wire(k, next), wire(k, saved))).map((k) => [k, wire(k, next)])
    );
    if (!Object.keys(body).length) return;
    setPending(section);
    try {
      const res = await patch.mutateAsync(body);
      const fresh = toForm(res.event);
      setSaved(fresh);
      // Keep unsaved edits in other sections; take the server's values for this one.
      setForm((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, fresh[k]])) }));
      toast.success(`${section} saved`);
      if (res.event.slug !== slug) {
        queryClient.removeQueries({ queryKey: eventKey(slug) });
        router.replace(`/manage/${res.event.slug}/settings`);
      } else {
        await queryClient.invalidateQueries({ queryKey: eventKey(slug) });
      }
      await queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setPending(null);
    }
  }

  const section = (title: string, keys: readonly Key[]) => ({
    title,
    dirty: dirty(keys),
    pending: pending === title,
    onSave: () => save(title, keys),
    onReset: () =>
      setForm((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, saved[k]])) })),
  });

  const scheduleError = scheduleProblem(form);

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        {...section("General", ["name", "slug", "tagline", "mode", "location", "hue"])}
        description="How the event is named and presented."
      >
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                value={form.name}
                maxLength={80}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="slug">URL</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>/e/</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="slug"
                  value={form.slug}
                  maxLength={48}
                  onChange={(e) =>
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                />
              </InputGroup>
              {form.slug !== saved.slug && (
                <FieldDescription>
                  Changing the URL breaks links already shared to /e/{saved.slug}.
                </FieldDescription>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="tagline">Tagline</FieldLabel>
            <Input
              id="tagline"
              value={form.tagline}
              maxLength={140}
              onChange={(e) => set("tagline", e.target.value)}
            />
            <FieldDescription className="tabular-nums">{form.tagline.length}/140</FieldDescription>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel>Format</FieldLabel>
              <Select
                value={form.mode}
                onValueChange={(v) => v && set("mode", v as Mode)}
                items={{ online: "Online", "in-person": "In person", hybrid: "Hybrid" }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="in-person">In person</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Input
                id="location"
                value={form.location}
                maxLength={120}
                disabled={form.mode === "online"}
                placeholder={
                  form.mode === "online" ? "Not needed for online events" : "Venue, city"
                }
                onChange={(e) => set("location", e.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldTitle>Cover hue</FieldTitle>
            <div className="flex items-center gap-4">
              <EventCover hue={form.hue} className="h-14 w-28 shrink-0 rounded-lg" />
              <Slider
                value={form.hue}
                min={0}
                max={360}
                aria-label="Cover hue"
                onValueChange={(v) => set("hue", Array.isArray(v) ? (v[0] ?? 0) : v)}
              />
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {form.hue}°
              </span>
            </div>
          </Field>
        </FieldGroup>
      </SectionCard>

      <SectionCard
        {...section("Overview", ["content"])}
        description="The long-form description on the event's Overview tab. Type / for blocks."
      >
        <div className="rounded-lg border px-4 py-3">
          <RichEditor
            value={form.content}
            onChange={(doc) => set("content", doc)}
            className="min-h-40"
            placeholder="What is this event about? Who should join?"
          />
        </div>
      </SectionCard>

      <SectionCard
        {...section("Rules", ["rules"])}
        description="Eligibility, code of conduct, what counts as a valid submission."
      >
        <div className="rounded-lg border px-4 py-3">
          <RichEditor
            value={form.rules}
            onChange={(doc) => set("rules", doc)}
            className="min-h-40"
            placeholder="Write the rules…"
          />
        </div>
      </SectionCard>

      <SectionCard
        {...section("Schedule", PROJECT_DATE_KEYS)}
        description={`Times are in your timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
        error={scheduleError}
      >
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <DateInput
              id="submissionsOpen"
              label="Submissions open"
              value={form.submissionsOpen}
              onChange={(v) => set("submissionsOpen", v)}
            />
            <DateInput
              id="submissionsClose"
              label="Submission deadline"
              required
              value={form.submissionsClose}
              onChange={(v) => set("submissionsClose", v)}
            />
            <DateInput
              id="judgingClose"
              label="Judging closes"
              value={form.judgingClose}
              onChange={(v) => set("judgingClose", v)}
            />
            <div className="hidden sm:block" />
            <DateInput
              id="votingOpen"
              label="Community voting opens"
              value={form.votingOpen}
              onChange={(v) => set("votingOpen", v)}
            />
            <DateInput
              id="votingClose"
              label="Community voting closes"
              value={form.votingClose}
              onChange={(v) => set("votingClose", v)}
            />
          </div>
        </FieldGroup>
      </SectionCard>

      <SectionCard
        {...section("Innolab journey", PITCH_KEYS)}
        description="Add an idea submission and preselection phase before teams create their projects."
        error={innolabScheduleProblem(form)}
      >
        <FieldGroup>
          <Field>
            <FieldLabel>Event journey</FieldLabel>
            <Select
              value={form.workflow}
              onValueChange={(value) => value && set("workflow", value as Workflow)}
              items={{ standard: "Standard Juryza", innolab: "Innolab" }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="standard">Standard Juryza</SelectItem>
                  <SelectItem value="innolab">Innolab</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Innolab collects and selects ideas before team formation. Existing project voting
              remains separate.
            </FieldDescription>
          </Field>
          {form.workflow === "innolab" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <DateInput
                id="pitchSubmissionsOpen"
                label="Idea submissions open"
                value={form.pitchSubmissionsOpen}
                onChange={(value) => set("pitchSubmissionsOpen", value)}
              />
              <DateInput
                id="pitchSubmissionsClose"
                label="Idea submissions close"
                value={form.pitchSubmissionsClose}
                onChange={(value) => set("pitchSubmissionsClose", value)}
                required
              />
              <DateInput
                id="pitchVotingOpen"
                label="Idea voting opens"
                value={form.pitchVotingOpen}
                onChange={(value) => set("pitchVotingOpen", value)}
                required
              />
              <DateInput
                id="pitchVotingClose"
                label="Idea voting closes"
                value={form.pitchVotingClose}
                onChange={(value) => set("pitchVotingClose", value)}
                required
              />
            </div>
          )}
        </FieldGroup>
      </SectionCard>

      <SectionCard
        {...section("Teams & judging", ["maxTeamSize", "reviewsPerProject"])}
        description="Applies to new teams and to the next assignment run."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="maxTeamSize">Max team size</FieldLabel>
            <Input
              id="maxTeamSize"
              type="number"
              min={1}
              max={20}
              value={form.maxTeamSize}
              onChange={(e) => set("maxTeamSize", e.target.valueAsNumber)}
            />
            <FieldDescription>1–20 people.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="reviewsPerProject">Reviews per project</FieldLabel>
            <Input
              id="reviewsPerProject"
              type="number"
              min={1}
              max={10}
              value={form.reviewsPerProject}
              onChange={(e) => set("reviewsPerProject", e.target.valueAsNumber)}
            />
            <FieldDescription>How many judges score each project (1–10).</FieldDescription>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        {...section("Community voting", [
          "votingAccess",
          "votingEmailDomains",
          "voteBudget",
          "votingMode",
          "votingShortlistSize",
          "votingElectorateLockAt",
        ])}
        description="Who may vote, how many quadratic-vote credits each voter gets, and the anti-abuse levers."
      >
        <FieldGroup>
          <RadioGroup
            value={form.votingAccess}
            onValueChange={(v) => set("votingAccess", v as Access)}
            className="grid gap-2 md:grid-cols-3"
          >
            {(
              [
                ["authenticated", "Signed-in users", "One ballot per account."],
                ["email", "Verified email", "Voters confirm an email address."],
                ["open", "Open link", "Anyone with the link."],
              ] as const
            ).map(([value, label, hint]) => (
              <FieldLabel key={value} htmlFor={`access-${value}`}>
                <Field orientation="horizontal">
                  <RadioGroupItem value={value} id={`access-${value}`} />
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>{hint}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="domains">Allowed email domains</FieldLabel>
              <Input
                id="domains"
                value={form.votingEmailDomains}
                disabled={form.votingAccess !== "email"}
                placeholder="university.edu, company.com"
                onChange={(e) => set("votingEmailDomains", e.target.value)}
              />
              <FieldDescription>
                Only used with “Verified email”. Leave empty to accept any domain.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="voteBudget">Vote credits</FieldLabel>
              <Input
                id="voteBudget"
                type="number"
                min={1}
                max={400}
                value={form.voteBudget}
                onChange={(e) => set("voteBudget", e.target.valueAsNumber)}
              />
              <FieldDescription>
                n votes on one project cost n² credits — {form.voteBudget || 0} credits allow up to{" "}
                {Math.floor(Math.sqrt(Math.max(0, form.voteBudget || 0)))} votes on a single
                project.
              </FieldDescription>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="votingMode">Voting mode</FieldLabel>
              <Select
                value={form.votingMode}
                onValueChange={(v) => set("votingMode", v as VotingMode)}
              >
                <SelectTrigger id="votingMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quadratic">Counted vote (quadratic)</SelectItem>
                  <SelectItem value="writeup">Write-up quest (judges decide)</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Write-up mode collects public input with no live tally; the panel makes the final
                pick.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="votingShortlistSize">Shortlist size</FieldLabel>
              <Input
                id="votingShortlistSize"
                type="number"
                min={0}
                max={100}
                value={form.votingShortlistSize}
                onChange={(e) => set("votingShortlistSize", e.target.valueAsNumber)}
              />
              <FieldDescription>
                0 = every submitted project is votable. Otherwise only the top-N by judged rank.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="votingElectorateLockAt">Electorate lock</FieldLabel>
              <Input
                id="votingElectorateLockAt"
                type="datetime-local"
                value={form.votingElectorateLockAt}
                onChange={(e) => set("votingElectorateLockAt", e.target.value)}
              />
              <FieldDescription>
                Only accounts created on or before this time may vote. Leave empty to allow all.
              </FieldDescription>
            </Field>
          </div>
        </FieldGroup>
      </SectionCard>

      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>
            Drafts are only visible to organizers. Publishing lists the event and opens
            registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldLabel htmlFor="visibility">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  {saved.visibility === "published" ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                  {saved.visibility === "published" ? "Published" : "Draft"}
                  <Badge variant={saved.visibility === "published" ? "default" : "outline"}>
                    {saved.visibility === "published" ? "Public" : "Only organizers"}
                  </Badge>
                </FieldTitle>
                <FieldDescription>
                  {saved.visibility === "published"
                    ? "Anyone can find the event, register and view submitted projects. Unpublishing hides it again."
                    : "Nobody else can see this event yet. Publish when details, dates and tracks are ready."}
                </FieldDescription>
              </FieldContent>
              {pending === "Visibility" ? (
                <Spinner />
              ) : (
                <Switch
                  id="visibility"
                  checked={saved.visibility === "published"}
                  onCheckedChange={(on) =>
                    save("Visibility", ["visibility"], { visibility: on ? "published" : "draft" })
                  }
                />
              )}
            </Field>
          </FieldLabel>
        </CardContent>
      </Card>

      <DangerZone slug={slug} name={saved.name} />
    </div>
  );
}

function scheduleProblem(f: Form): string | null {
  const t = (v: string) => (v ? new Date(v).getTime() : null);
  const open = t(f.submissionsOpen);
  const close = t(f.submissionsClose);
  const judging = t(f.judgingClose);
  const vOpen = t(f.votingOpen);
  const vClose = t(f.votingClose);
  if (close === null) return "The submission deadline is required.";
  if (open !== null && open >= close) return "Submissions must open before the deadline.";
  if (judging !== null && judging <= close)
    return "Judging must close after the submission deadline.";
  if (vOpen !== null && vClose !== null && vOpen >= vClose)
    return "Voting must open before it closes.";
  return null;
}

function innolabScheduleProblem(f: Form): string | null {
  if (f.workflow !== "innolab") return null;
  const t = (value: string) => (value ? new Date(value).getTime() : null);
  const submissionsOpen = t(f.pitchSubmissionsOpen);
  const submissionsClose = t(f.pitchSubmissionsClose);
  const votingOpen = t(f.pitchVotingOpen);
  const votingClose = t(f.pitchVotingClose);
  const projectsOpen = t(f.submissionsOpen);
  if (submissionsClose === null || votingOpen === null || votingClose === null) {
    return "Set the idea submission deadline and the complete voting window.";
  }
  if (submissionsOpen !== null && submissionsOpen >= submissionsClose) {
    return "Idea submissions must open before they close.";
  }
  if (votingOpen < submissionsClose) return "Idea voting must start after submissions close.";
  if (votingClose <= votingOpen) return "Idea voting must close after it opens.";
  if (projectsOpen !== null && projectsOpen < votingClose) {
    return "Project submissions must open after idea voting closes.";
  }
  return null;
}

function DateInput({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        {!required && <span className="text-muted-foreground font-normal">(optional)</span>}
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          type="datetime-local"
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
        {!required && value && (
          <Button variant="ghost" onClick={() => onChange("")} aria-label={`Clear ${label}`}>
            Clear
          </Button>
        )}
      </div>
    </Field>
  );
}

function SectionCard({
  title,
  description,
  dirty,
  pending,
  onSave,
  onReset,
  error,
  children,
}: {
  title: string;
  description: string;
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onReset: () => void;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(dirty && "ring-primary/40 ring-2")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {dirty && <Badge variant="secondary">Unsaved</Badge>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="justify-between gap-2 border-t">
        <p className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? (dirty ? "You have unsaved changes." : "Up to date.")}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" onClick={onReset} disabled={pending}>
              Discard
            </Button>
          )}
          <Button onClick={onSave} disabled={!dirty || pending || Boolean(error)}>
            {pending ? <Spinner /> : <Save />} Save
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function DangerZone({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/events/${slug}`),
    onSuccess: async () => {
      toast.success(`Deleted ${name}`);
      queryClient.removeQueries({ queryKey: eventKey(slug) });
      await queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      await queryClient.invalidateQueries({ queryKey: ["manage", "events"] });
      router.push("/manage");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card className="ring-destructive/30 ring-1">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <TriangleAlert className="size-4" /> Danger zone
        </CardTitle>
        <CardDescription>
          Deleting the event removes its teams, projects, scores, votes, comments and certificates.
          This can't be undone — download an export first if you need the data.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-t">
        <AlertDialog onOpenChange={(open) => !open && setConfirm("")}>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <Trash2 /> Delete event
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything in this event is permanently deleted. Type{" "}
                <span className="text-foreground font-medium">{name}</span> to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={name}
              aria-label="Event name"
              autoFocus
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={confirm !== name || remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? <Spinner /> : <Trash2 />} Delete forever
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
