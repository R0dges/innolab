"use client";

/**
 * /manage/new — the create-event wizard: basics → schedule → tracks → rules →
 * review. Creates the event with POST /api/events (a draft unless "Publish
 * immediately" is ticked) and opens its console.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Globe,
  Laptop,
  MapPin,
  Plus,
  Rocket,
  ShieldAlert,
  Sparkles,
  Tags,
  UsersRound,
  Vote,
  X,
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
import { Checkbox } from "@juryza/ui/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
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
import { Separator } from "@juryza/ui/components/ui/separator";
import { Slider } from "@juryza/ui/components/ui/slider";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { cn } from "@juryza/ui/lib/utils";

import { coverStyle, EventCover } from "@/components/event-bits";
import { PageHeader } from "@/components/page";
import { useViewer } from "@/components/viewer";
import { ApiError, api } from "@/lib/api";
import {
  DEFAULT_EVENT_LOCATION,
  DEFAULT_EVENT_MODE,
  DEFAULT_EVENT_WORKFLOW,
  type EventMode,
  type EventWorkflow,
  eventLocationOptions,
} from "@/lib/event-options";
import { formatDateTime, pluralize } from "@/lib/format";
import { hasAtLeast } from "@/lib/roles";

type Access = "authenticated" | "email" | "open";

interface Draft {
  name: string;
  slug: string;
  slugEdited: boolean;
  tagline: string;
  mode: EventMode;
  location: string;
  workflow: EventWorkflow;
  hue: number;
  pitchSubmissionsOpen: string;
  pitchSubmissionsClose: string;
  pitchVotingOpen: string;
  pitchVotingClose: string;
  submissionsOpen: string;
  submissionsClose: string;
  judgingClose: string;
  votingOpen: string;
  votingClose: string;
  tracks: string[];
  maxTeamSize: number;
  reviewsPerProject: number;
  votingAccess: Access;
  domains: string;
  voteBudget: number;
  publish: boolean;
}

const STEPS = [
  { key: "basics", label: "Informations", icon: Sparkles },
  { key: "schedule", label: "Calendrier", icon: CalendarClock },
  { key: "tracks", label: "Axes", icon: Tags },
  { key: "rules", label: "Règles", icon: UsersRound },
  { key: "review", label: "Vérification", icon: Rocket },
] as const;

const HUES = [250, 285, 320, 10, 45, 150, 185, 215];
const TRACK_SUGGESTIONS = [
  "Intelligence artificielle",
  "Outils internes",
  "Climat",
  "Santé",
  "Formation",
  "Accessibilité",
  "Sécurité",
  "Impact social",
  "Processus métier",
  "Qualité de service",
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

/** A Date as the value of a `datetime-local` input (local time, minute precision). */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const iso = (local: string) => (local ? new Date(local).toISOString() : null);
const time = (local: string) => (local ? new Date(local).getTime() : null);

function nextWeekday(day: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7));
  d.setHours(hour, 0, 0, 0);
  return d;
}
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

type Schedule = Pick<
  Draft,
  | "pitchSubmissionsOpen"
  | "pitchSubmissionsClose"
  | "pitchVotingOpen"
  | "pitchVotingClose"
  | "submissionsOpen"
  | "submissionsClose"
  | "judgingClose"
  | "votingOpen"
  | "votingClose"
>;

/** Recommended one-week journey: prepare Friday, present Monday at 10, finish Friday. */
function innolabWeekPreset(): Schedule {
  const pitchSubmissionsOpen = nextWeekday(5, 9);
  const pitchSubmissionsClose = addHours(pitchSubmissionsOpen, 3 * 24 + 1);
  const pitchVotingOpen = pitchSubmissionsClose;
  const pitchVotingClose = addHours(pitchVotingOpen, 2);
  const submissionsOpen = addHours(pitchVotingClose, 1);
  const submissionsClose = addHours(pitchSubmissionsOpen, 7 * 24 + 7);
  return {
    pitchSubmissionsOpen: toLocalInput(pitchSubmissionsOpen),
    pitchSubmissionsClose: toLocalInput(pitchSubmissionsClose),
    pitchVotingOpen: toLocalInput(pitchVotingOpen),
    pitchVotingClose: toLocalInput(pitchVotingClose),
    submissionsOpen: toLocalInput(submissionsOpen),
    submissionsClose: toLocalInput(submissionsClose),
    judgingClose: toLocalInput(addHours(submissionsClose, 2)),
    votingOpen: "",
    votingClose: "",
  };
}

const PRESETS: {
  label: string;
  hint: string;
  build: () => Schedule;
}[] = [
  {
    label: "Semaine Innovation Lab",
    hint: "Préparation vendredi, pitchs lundi à 10 h, projets jusqu’au vendredi",
    build: innolabWeekPreset,
  },
];

const initial = (): Draft => ({
  name: "",
  slug: "",
  slugEdited: false,
  tagline: "",
  mode: DEFAULT_EVENT_MODE,
  location: DEFAULT_EVENT_LOCATION,
  workflow: DEFAULT_EVENT_WORKFLOW,
  hue: 250,
  pitchSubmissionsOpen: "",
  pitchSubmissionsClose: "",
  pitchVotingOpen: "",
  pitchVotingClose: "",
  submissionsOpen: "",
  submissionsClose: "",
  judgingClose: "",
  votingOpen: "",
  votingClose: "",
  tracks: [],
  maxTeamSize: 6,
  reviewsPerProject: 3,
  votingAccess: "authenticated",
  domains: "",
  voteBudget: 16,
  publish: false,
});

type Errors = Partial<Record<keyof Draft, string>>;

function validate(step: number, d: Draft): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (d.name.trim().length < 3) e.name = "Indiquez un nom d’au moins 3 caractères";
    if (d.slug.length < 3) e.slug = "Au moins 3 caractères";
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug))
      e.slug = "Uniquement des minuscules, des chiffres et des tirets simples";
    else if (["import", "new", "api", "admin", "settings"].includes(d.slug))
      e.slug = "Cette adresse est réservée";
    if (d.tagline.length > 140) e.tagline = "Maximum 140 caractères";
    if (d.mode !== "online" && !d.location.trim()) e.location = "Indiquez le lieu";
  }
  if (step === 1) {
    const pitchOpen = time(d.pitchSubmissionsOpen);
    const pitchClose = time(d.pitchSubmissionsClose);
    const pitchVoteOpen = time(d.pitchVotingOpen);
    const pitchVoteClose = time(d.pitchVotingClose);
    const open = time(d.submissionsOpen);
    const close = time(d.submissionsClose);
    const judging = time(d.judgingClose);
    const vOpen = time(d.votingOpen);
    const vClose = time(d.votingClose);
    if (d.workflow === "innolab") {
      if (pitchClose === null) e.pitchSubmissionsClose = "La clôture des pitchs est obligatoire";
      if (pitchVoteOpen === null) e.pitchVotingOpen = "Le début de l’évaluation est obligatoire";
      if (pitchVoteClose === null) e.pitchVotingClose = "La fin de l’évaluation est obligatoire";
      if (pitchOpen !== null && pitchClose !== null && pitchOpen >= pitchClose)
        e.pitchSubmissionsClose = "Doit être postérieure à l’ouverture des pitchs";
      if (pitchClose !== null && pitchVoteOpen !== null && pitchVoteOpen < pitchClose)
        e.pitchVotingOpen = "Doit être postérieure à la clôture des pitchs";
      if (pitchVoteOpen !== null && pitchVoteClose !== null && pitchVoteOpen >= pitchVoteClose)
        e.pitchVotingClose = "Doit être postérieure au début de l’évaluation";
      if (pitchVoteClose !== null && open !== null && open < pitchVoteClose)
        e.submissionsOpen = "Les projets doivent commencer après l’évaluation des pitchs";
    }
    if (close === null) e.submissionsClose = "La fin des projets est obligatoire";
    if (open !== null && close !== null && open >= close)
      e.submissionsClose = "Doit être postérieure au début des projets";
    if (judging !== null && close !== null && judging <= close)
      e.judgingClose = "L’évaluation doit se terminer après la fin des projets";
    if (d.workflow === "standard" && vOpen !== null && vClose !== null && vOpen >= vClose)
      e.votingClose = "Must be after voting opens";
    if (d.workflow === "standard" && vClose !== null && close !== null && vClose <= close)
      e.votingClose = "Voting should close after the submission deadline";
  }
  if (step === 3) {
    if (d.reviewsPerProject < 1 || d.reviewsPerProject > 10)
      e.reviewsPerProject = "Between 1 and 10";
    if (d.voteBudget < 1 || d.voteBudget > 400) e.voteBudget = "Between 1 and 400";
    if (d.workflow === "standard" && d.votingAccess === "email" && !parseDomains(d.domains).length)
      e.domains = "Add at least one allowed email domain";
  }
  return e;
}

const parseDomains = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim().toLowerCase().replace(/^@/, ""))
    .filter((x) => x.length >= 3);

export default function NewEventPage() {
  const viewer = useViewer();
  const coach = hasAtLeast(viewer?.role, "judge");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Default schedule is computed in the browser (local timezone), not during SSR.
  useEffect(() => {
    setD((prev) =>
      prev.submissionsClose ? prev : { ...prev, ...innolabWeekPreset() }
    );
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; slug: string }>("/api/events", {
        name: d.name.trim(),
        slug: d.slug,
        tagline: d.tagline.trim() || null,
        mode: d.mode,
        location: d.mode === "online" ? null : d.location.trim() || null,
        workflow: "innolab",
        hue: d.hue,
        visibility: d.publish ? "published" : "draft",
        pitchSubmissionsOpen: d.workflow === "innolab" ? iso(d.pitchSubmissionsOpen) : null,
        pitchSubmissionsClose: d.workflow === "innolab" ? iso(d.pitchSubmissionsClose) : null,
        pitchVotingOpen: d.workflow === "innolab" ? iso(d.pitchVotingOpen) : null,
        pitchVotingClose: d.workflow === "innolab" ? iso(d.pitchVotingClose) : null,
        submissionsOpen: iso(d.submissionsOpen),
        submissionsClose: iso(d.submissionsClose),
        judgingClose: iso(d.judgingClose),
        votingOpen: d.workflow === "standard" ? iso(d.votingOpen) : null,
        votingClose: d.workflow === "standard" ? iso(d.votingClose) : null,
        tracks: d.tracks,
        maxTeamSize: 6,
        reviewsPerProject: d.reviewsPerProject,
        votingAccess: d.votingAccess,
        votingEmailDomains: d.votingAccess === "email" ? parseDomains(d.domains) : [],
        voteBudget: d.voteBudget,
      }),
    onSuccess: async (res) => {
      toast.success(d.publish ? "Événement créé et publié" : "Brouillon créé");
      await queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      await queryClient.invalidateQueries({ queryKey: ["manage", "events"] });
      router.push(`/manage/${res.slug}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setErrors({ slug: e.message });
        setStep(0);
        return;
      }
      setServerError(e.message);
    },
  });

  const next = () => {
    const e = validate(step, d);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const goTo = (i: number) => {
    if (i <= step) return setStep(i);
    for (let s = step; s < i; s++) {
      const e = validate(s, d);
      if (Object.values(e).some(Boolean)) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    setStep(i);
  };

  if (!coach) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert />
          </EmptyMedia>
          <EmptyTitle>Rôle de coach nécessaire</EmptyTitle>
          <EmptyDescription>
            Seuls les coachs peuvent créer et conduire un événement. Un administrateur peut attribuer
            ce rôle à votre compte.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
            Voir les événements
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/manage" className="hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Mes événements
          </Link>
        }
        title="Créer un événement Innovation Lab"
        description="Cinq étapes pour préparer le parcours. Les informations resteront modifiables ensuite."
      />

      <Stepper step={step} onSelect={goTo} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>
              Étape {step + 1} · {STEPS[step]?.label}
            </CardTitle>
            <CardDescription>{STEP_HELP[step]}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 0 && <BasicsStep d={d} set={set} errors={errors} />}
            {step === 1 && <ScheduleStep d={d} set={set} setD={setD} errors={errors} />}
            {step === 2 && <TracksStep d={d} set={set} />}
            {step === 3 && <RulesStep d={d} set={set} errors={errors} />}
            {step === 4 && <ReviewStep d={d} set={set} onEdit={setStep} />}
            {serverError && step === 4 && (
              <Alert variant="destructive" className="mt-6">
                <AlertTitle>Impossible de créer l’événement</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>
                Continuer <ArrowRight />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setServerError(null);
                  create.mutate();
                }}
                disabled={create.isPending}
              >
                {create.isPending ? <Spinner /> : <Rocket />}
                {d.publish ? "Créer et publier" : "Créer le brouillon"}
              </Button>
            )}
          </CardFooter>
        </Card>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Aperçu
          </p>
          <Card className="gap-0 overflow-hidden py-0">
            <EventCover hue={d.hue} className="flex h-32 items-end p-4">
              <span className="text-lg font-semibold text-white drop-shadow">
                {d.name.trim() || "Votre événement"}
              </span>
            </EventCover>
            <CardContent className="flex flex-col gap-2 p-4 text-sm">
              <p className="text-muted-foreground line-clamp-2">
                {d.tagline || "Une courte description apparaîtra ici."}
              </p>
              <p className="flex items-center gap-1.5">
                <ModeIcon mode={d.mode} className="text-muted-foreground size-3.5" />
                <span className="capitalize">{d.mode}</span>
                {d.mode !== "online" && d.location && (
                  <span className="text-muted-foreground truncate">· {d.location}</span>
                )}
              </p>
              {d.submissionsClose && (
                <p className="text-muted-foreground text-xs">
                  Fin des projets : {formatDateTime(new Date(d.submissionsClose))}
                </p>
              )}
              {d.tracks.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {d.tracks.slice(0, 4).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                  {d.tracks.length > 4 && <Badge variant="outline">+{d.tracks.length - 4}</Badge>}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-muted-foreground font-mono text-xs break-all">
            /e/{d.slug || "votre-evenement"}
          </p>
        </aside>
      </div>
    </>
  );
}

const STEP_HELP = [
  "Nommez l’événement, indiquez son format et personnalisez sa couverture.",
  "Planifiez la préparation des pitchs, leur évaluation, les projets et leur évaluation finale.",
  "Les axes permettent de regrouper les projets. Ils restent facultatifs.",
  "Définissez la taille des groupes et les règles d’évaluation des projets.",
  "Vérifiez les informations avant de créer l’événement.",
];

function Stepper({ step, onSelect }: { step: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Progression">
      <ol className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.key} className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3",
                  current && "border-primary bg-primary/10 text-foreground font-medium",
                  done && "text-foreground hover:bg-muted",
                  !current && !done && "text-muted-foreground hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-xs tabular-nums",
                    done
                      ? "bg-primary text-primary-foreground"
                      : current
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <span className={cn("h-px w-6", done ? "bg-primary" : "bg-border")} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ModeIcon({ mode, className }: { mode: EventMode; className?: string }) {
  const Icon = mode === "online" ? Laptop : mode === "in-person" ? MapPin : Globe;
  return <Icon className={className} />;
}

type SetFn = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function BasicsStep({ d, set, errors }: { d: Draft; set: SetFn; errors: Errors }) {
  const locationOptions = eventLocationOptions(d.location);

  return (
    <FieldGroup>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="name">Nom de l’événement</FieldLabel>
        <Input
          id="name"
          autoFocus
          value={d.name}
          maxLength={80}
          placeholder="Innovation Lab — octobre 2027"
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => {
            set("name", e.target.value);
            if (!d.slugEdited) set("slug", slugify(e.target.value));
          }}
        />
        <FieldError>{errors.name}</FieldError>
      </Field>

      <Field data-invalid={Boolean(errors.slug)}>
        <FieldLabel htmlFor="slug">Adresse de l’événement</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>/e/</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="slug"
            value={d.slug}
            maxLength={48}
            placeholder="spring-build-2027"
            aria-invalid={Boolean(errors.slug)}
            onChange={(e) => {
              set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              set("slugEdited", true);
            }}
          />
        </InputGroup>
        {errors.slug ? (
          <FieldError>{errors.slug}</FieldError>
        ) : (
          <FieldDescription>
            L’événement sera accessible à l’adresse{" "}
            <span className="text-foreground font-mono">/e/{d.slug || "…"}</span>
            {d.slugEdited && (
              <>
                {" · "}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    set("slug", slugify(d.name));
                    set("slugEdited", false);
                  }}
                >
                  recalculer depuis le nom
                </button>
              </>
            )}
          </FieldDescription>
        )}
      </Field>

      <Field data-invalid={Boolean(errors.tagline)}>
        <FieldLabel htmlFor="tagline">Description courte</FieldLabel>
        <Input
          id="tagline"
          value={d.tagline}
          placeholder="Le problème étudié pendant cette semaine d’Innovation Lab."
          onChange={(e) => set("tagline", e.target.value)}
        />
        <FieldDescription className="flex justify-between">
          <span>Affichée sur les cartes et en tête de la page.</span>
          <span className="tabular-nums">{d.tagline.length}/140</span>
        </FieldDescription>
        <FieldError>{errors.tagline}</FieldError>
      </Field>

      <Field>
        <FieldTitle>Modalité</FieldTitle>
        <RadioGroup
          value={d.mode}
          onValueChange={(value) => {
            const mode = value as EventMode;
            set("mode", mode);
            if (mode === "online") set("location", "");
            else if (!d.location) set("location", DEFAULT_EVENT_LOCATION);
          }}
          className="grid gap-2 sm:grid-cols-3"
        >
          {(
            [
              ["online", "En ligne", "À distance"],
              ["in-person", "En présentiel", "Un lieu unique"],
              ["hybrid", "Hybride", "Sur place et à distance"],
            ] as const
          ).map(([value, label, hint]) => (
            <FieldLabel key={value} htmlFor={`mode-${value}`}>
              <Field orientation="horizontal">
                <RadioGroupItem value={value} id={`mode-${value}`} />
                <FieldContent>
                  <FieldTitle>
                    <ModeIcon mode={value} className="size-3.5" /> {label}
                  </FieldTitle>
                  <FieldDescription>{hint}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </Field>

      {d.mode !== "online" && (
        <Field data-invalid={Boolean(errors.location)}>
          <FieldLabel htmlFor="location">Lieu</FieldLabel>
          <Select
            items={locationOptions}
            value={d.location}
            onValueChange={(value) => value && set("location", value)}
          >
            <SelectTrigger id="location" className="w-full" aria-invalid={Boolean(errors.location)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {locationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError>{errors.location}</FieldError>
        </Field>
      )}

      <Field>
        <FieldTitle>Couleur de couverture</FieldTitle>
        <div className="flex flex-wrap items-center gap-2">
          {HUES.map((h) => (
            <button
              key={h}
              type="button"
              aria-label={`Hue ${h}`}
              aria-pressed={d.hue === h}
              onClick={() => set("hue", h)}
              className={cn(
                "focus-visible:ring-ring/50 size-8 rounded-full ring-offset-2 ring-offset-background transition outline-none focus-visible:ring-3",
                d.hue === h && "ring-foreground ring-2"
              )}
              style={coverStyle(h)}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Slider
            value={d.hue}
            min={0}
            max={360}
            onValueChange={(v) => set("hue", Array.isArray(v) ? (v[0] ?? 0) : v)}
            aria-label="Cover hue"
          />
          <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
            {d.hue}°
          </span>
        </div>
        <EventCover hue={d.hue} className="h-20 rounded-lg" />
      </Field>
    </FieldGroup>
  );
}

function DateField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  optional = true,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? <span className="text-muted-foreground font-normal">(facultatif)</span> : null}
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          type="datetime-local"
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
        {optional && value && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Effacer ${label}`}
            onClick={() => onChange("")}
          >
            <X />
          </Button>
        )}
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
    </Field>
  );
}

function ScheduleStep({
  d,
  set,
  setD,
  errors,
}: {
  d: Draft;
  set: SetFn;
  setD: React.Dispatch<React.SetStateAction<Draft>>;
  errors: Errors;
}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Appliquer le calendrier recommandé</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setD((prev) => ({ ...prev, ...p.build() }))}
              className="hover:bg-muted focus-visible:ring-ring/50 flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3"
            >
              <span className="text-sm font-medium">{p.label}</span>
              <span className="text-muted-foreground text-xs">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <Separator />
      <FieldGroup>
        {d.workflow === "innolab" && (
          <>
            <FieldDescription>
              Le parcours commence par la préparation des pitchs, leur présentation et leur
              évaluation par les participants. Les pitchs retenus deviennent ensuite des projets.
            </FieldDescription>
            <div className="grid gap-5 sm:grid-cols-2">
              <DateField
                id="pitchSubmissionsOpen"
                label="Ouverture de la préparation des pitchs"
                hint="Recommandation : vendredi matin."
                value={d.pitchSubmissionsOpen}
                onChange={(value) => set("pitchSubmissionsOpen", value)}
                error={errors.pitchSubmissionsOpen}
              />
              <DateField
                id="pitchSubmissionsClose"
                label="Clôture des pitchs et début de la présentation"
                optional={false}
                value={d.pitchSubmissionsClose}
                onChange={(value) => set("pitchSubmissionsClose", value)}
                error={errors.pitchSubmissionsClose}
              />
              <DateField
                id="pitchVotingOpen"
                label="Ouverture de l’évaluation des pitchs"
                optional={false}
                value={d.pitchVotingOpen}
                onChange={(value) => set("pitchVotingOpen", value)}
                error={errors.pitchVotingOpen}
              />
              <DateField
                id="pitchVotingClose"
                label="Clôture de l’évaluation des pitchs"
                optional={false}
                value={d.pitchVotingClose}
                onChange={(value) => set("pitchVotingClose", value)}
                error={errors.pitchVotingClose}
              />
            </div>
            <Separator />
          </>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <DateField
            id="submissionsOpen"
            label="Début des projets"
            hint="Après la sélection automatique des pitchs retenus."
            value={d.submissionsOpen}
            onChange={(v) => set("submissionsOpen", v)}
            error={errors.submissionsOpen}
          />
          <DateField
            id="submissionsClose"
            label="Fin du travail sur les projets"
            optional={false}
            hint="Les projets sont verrouillés à cet instant."
            value={d.submissionsClose}
            onChange={(v) => set("submissionsClose", v)}
            error={errors.submissionsClose}
          />
        </div>
        <DateField
          id="judgingClose"
          label="Fin de l’évaluation des projets"
          hint="Les coachs ne peuvent plus modifier leurs évaluations après cette date."
          value={d.judgingClose}
          onChange={(v) => set("judgingClose", v)}
          error={errors.judgingClose}
        />
        {d.workflow === "standard" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <DateField
              id="votingOpen"
              label="Community voting opens"
              value={d.votingOpen}
              onChange={(v) => set("votingOpen", v)}
              error={errors.votingOpen}
            />
            <DateField
              id="votingClose"
              label="Community voting closes"
              hint="Leave both empty to skip the community vote."
              value={d.votingClose}
              onChange={(v) => set("votingClose", v)}
              error={errors.votingClose}
            />
          </div>
        )}
      </FieldGroup>
      <p className="text-muted-foreground text-xs">
        Les horaires utilisent votre fuseau ({tz}) et sont enregistrés en UTC.
      </p>
    </div>
  );
}

function TracksStep({ d, set }: { d: Draft; set: SetFn }) {
  const [value, setValue] = useState("");
  const add = (name: string) => {
    const t = name.trim().slice(0, 60);
    if (!t || d.tracks.some((x) => x.toLowerCase() === t.toLowerCase()) || d.tracks.length >= 30)
      return;
    set("tracks", [...d.tracks, t]);
  };
  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(value);
          setValue("");
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ajouter un axe, par ex. Qualité de service"
          aria-label="Nom de l’axe"
          maxLength={60}
        />
        <Button type="submit" variant="outline" disabled={!value.trim()}>
          <Plus /> Ajouter
        </Button>
      </form>

      {d.tracks.length ? (
        <div className="flex flex-wrap gap-2">
          {d.tracks.map((t) => (
            <span
              key={t}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
            >
              {t}
              <button
                type="button"
                aria-label={`Retirer ${t}`}
                onClick={() =>
                  set(
                    "tracks",
                    d.tracks.filter((x) => x !== t)
                  )
                }
                className="hover:bg-foreground/10 focus-visible:ring-ring/50 grid size-5 place-items-center rounded-full outline-none focus-visible:ring-2"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          Aucun axe — tous les projets resteront dans le même ensemble.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Suggestions
        </p>
        <div className="flex flex-wrap gap-2">
          {TRACK_SUGGESTIONS.filter((s) => !d.tracks.includes(s)).map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => add(s)}>
              <Plus /> {s}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  error?: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isNaN(value) ? "" : value}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="tabular-nums"
      />
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

function RulesStep({ d, set, errors }: { d: Draft; set: SetFn; errors: Errors }) {
  const maxVotes = Math.floor(Math.sqrt(Math.max(1, d.voteBudget || 1)));
  return (
    <FieldGroup>
      <Alert>
        <UsersRound />
        <AlertTitle>Groupes de 5 à 6 participants</AlertTitle>
        <AlertDescription>
          Chaque projet accepte au maximum 6 participants. La sélection des pitchs vise des groupes
          d’au moins 5 participants, sans empêcher la constitution progressive des groupes.
        </AlertDescription>
      </Alert>

      {d.workflow === "standard" && (
        <>
          <Separator />

          <Field>
            <FieldTitle>
              <Vote className="size-4" /> Who can vote in the community vote?
            </FieldTitle>
            <RadioGroup
              value={d.votingAccess}
              onValueChange={(v) => set("votingAccess", v as Access)}
            >
              {(
                [
                  [
                    "authenticated",
                    "Signed-in users",
                    "Anyone with a Juryza account. One ballot per account.",
                  ],
                  [
                    "email",
                    "Verified email",
                    "Voters confirm an email address, optionally restricted to your domains.",
                  ],
                  [
                    "open",
                    "Open link",
                    "Anyone with the link. Easiest, but least resistant to ballot stuffing.",
                  ],
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
          </Field>

          {d.votingAccess === "email" && (
            <Field data-invalid={Boolean(errors.domains)}>
              <FieldLabel htmlFor="domains">Allowed email domains</FieldLabel>
              <Input
                id="domains"
                value={d.domains}
                placeholder="university.edu, company.com"
                onChange={(e) => set("domains", e.target.value)}
              />
              {errors.domains ? (
                <FieldError>{errors.domains}</FieldError>
              ) : (
                <FieldDescription>
                  Comma-separated. Only addresses at these domains can verify and vote.
                </FieldDescription>
              )}
            </Field>
          )}

          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <NumberField
              id="voteBudget"
              label="Vote credits per voter"
              hint="Quadratic voting budget."
              value={d.voteBudget}
              min={1}
              max={400}
              onChange={(n) => set("voteBudget", n)}
              error={errors.voteBudget}
            />
            <div className="bg-muted/50 flex flex-col gap-2 rounded-lg p-4 text-sm">
              <p className="font-medium">How quadratic voting works</p>
              <p className="text-muted-foreground">
                Casting <em>n</em> votes on one project costs <em>n²</em> credits, so strong
                preferences get expensive and a loud minority can't dominate.
              </p>
              <p className="text-muted-foreground">
                With {pluralize(d.voteBudget || 0, "credit")}, a voter could put{" "}
                <span className="text-foreground font-medium tabular-nums">{maxVotes}</span> votes
                on a single project, or 1 vote on each of{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {d.voteBudget || 0}
                </span>{" "}
                projects.
              </p>
            </div>
          </div>
        </>
      )}
    </FieldGroup>
  );
}

function ReviewStep({ d, set, onEdit }: { d: Draft; set: SetFn; onEdit: (step: number) => void }) {
  const dt = (v: string) => (v ? formatDateTime(new Date(v)) : "—");
  const groups: { step: number; title: string; rows: [string, React.ReactNode][] }[] = [
    {
      step: 0,
      title: "Informations",
      rows: [
        ["Nom", d.name],
        [
          "Adresse",
          <span key="u" className="font-mono">
            /e/{d.slug}
          </span>,
        ],
        ["Description", d.tagline || "—"],
        ["Parcours", "Innovation Lab"],
        ["Modalité", `${d.mode}${d.mode !== "online" && d.location ? ` · ${d.location}` : ""}`],
      ],
    },
    {
      step: 1,
      title: "Calendrier",
      rows: [
        [
          "Préparation des pitchs",
          `${d.pitchSubmissionsOpen ? dt(d.pitchSubmissionsOpen) : "Immédiatement"} → ${dt(d.pitchSubmissionsClose)}`,
        ],
        ["Évaluation des pitchs", `${dt(d.pitchVotingOpen)} → ${dt(d.pitchVotingClose)}`],
        ["Début des projets", d.submissionsOpen ? dt(d.submissionsOpen) : "Immédiatement"],
        ["Fin des projets", dt(d.submissionsClose)],
        ["Fin des évaluations", dt(d.judgingClose)],
      ],
    },
    {
      step: 2,
      title: "Axes",
      rows: [["Axes", d.tracks.length ? d.tracks.join(", ") : "Aucun"]],
    },
    {
      step: 3,
      title: "Règles",
      rows: [["Participants par projet", "5 à 6 (maximum 6)"]],
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{g.title}</p>
            <Button variant="ghost" size="xs" onClick={() => onEdit(g.step)}>
              Modifier
            </Button>
          </div>
          <dl className="divide-y rounded-lg border text-sm">
            {g.rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[160px_1fr] gap-3 px-3 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        Les critères généraux d’évaluation Innovation Lab sont ajoutés automatiquement. Un
        administrateur pourra les adapter avant le début des projets.
      </p>
      <FieldLabel htmlFor="publish">
        <Field orientation="horizontal">
          <Checkbox
            id="publish"
            checked={d.publish}
            onCheckedChange={(c) => set("publish", Boolean(c))}
          />
          <FieldContent>
            <FieldTitle>Publier immédiatement</FieldTitle>
            <FieldDescription>
              Sinon, l’événement reste un brouillon visible uniquement par les coachs.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </div>
  );
}
