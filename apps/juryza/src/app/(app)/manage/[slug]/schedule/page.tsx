"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarDays, Clock, MapPin, Pencil, Plus, RotateCcw, Save } from "lucide-react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@juryza/ui/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@juryza/ui/components/ui/field";
import { Input } from "@juryza/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juryza/ui/components/ui/select";
import { Skeleton } from "@juryza/ui/components/ui/skeleton";
import { Spinner } from "@juryza/ui/components/ui/spinner";
import { Switch } from "@juryza/ui/components/ui/switch";
import { Textarea } from "@juryza/ui/components/ui/textarea";

import { Section } from "@/components/page";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { eventKey } from "@/lib/queries";
import {
  SCHEDULE_AUDIENCE_LABELS,
  SCHEDULE_AUDIENCES,
  SCHEDULE_KIND_LABELS,
  SCHEDULE_KINDS,
  type ScheduleAudience,
  type ScheduleKind,
} from "@/lib/schedule";
import type { Json, ScheduleItem } from "@/lib/types";

type ScheduleRow = Json<ScheduleItem>;
type ScheduleForm = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  kind: ScheduleKind;
  audience: ScheduleAudience;
  required: boolean;
};

const KIND_OPTIONS = SCHEDULE_KINDS.map((value) => ({
  value,
  label: SCHEDULE_KIND_LABELS[value],
}));
const AUDIENCE_OPTIONS = SCHEDULE_AUDIENCES.map((value) => ({
  value,
  label: SCHEDULE_AUDIENCE_LABELS[value],
}));
const EMPTY_FORM: ScheduleForm = {
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  location: "",
  kind: "workshop",
  audience: "participants",
  required: true,
};

const toLocalInput = (value: string) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export default function ManageSchedulePage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const scheduleQuery = useQuery({
    queryKey: [...eventKey(slug), "schedule"],
    queryFn: () => api.get<{ schedule: ScheduleRow[] }>(`/api/events/${slug}/schedule`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: eventKey(slug) });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      };
      return editingId
        ? api.patch(`/api/schedule-items/${editingId}`, payload)
        : api.post(`/api/events/${slug}/schedule`, payload);
    },
    onSuccess: async () => {
      toast.success(editingId ? "Activity updated" : "Activity added");
      setEditingId(null);
      setForm(EMPTY_FORM);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: (itemId: string) => api.delete(`/api/schedule-items/${itemId}`),
    onSuccess: async () => {
      toast.success("Activity cancelled");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: (itemId: string) =>
      api.patch(`/api/schedule-items/${itemId}`, { status: "scheduled" }),
    onSuccess: async () => {
      toast.success("Activity restored");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const set = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const edit = (item: ScheduleRow) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description ?? "",
      startsAt: toLocalInput(item.startsAt),
      endsAt: toLocalInput(item.endsAt),
      location: item.location ?? "",
      kind: item.kind as ScheduleKind,
      audience: item.audience as ScheduleAudience,
      required: item.required,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const rows = scheduleQuery.data?.schedule ?? [];

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Innovation Lab calendar"
        description="Plan activities once, then keep the dashboard and subscribed Outlook calendars in sync."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? "Edit activity" : "Add an activity"}</CardTitle>
              <CardDescription>
                Dates are entered in your local time and published as universal UTC timestamps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                id="schedule-item-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate();
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="schedule-title">Title</FieldLabel>
                    <Input
                      id="schedule-title"
                      value={form.title}
                      onChange={(event) => set("title", event.target.value)}
                      maxLength={140}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="schedule-description">Description</FieldLabel>
                    <Textarea
                      id="schedule-description"
                      value={form.description}
                      onChange={(event) => set("description", event.target.value)}
                      rows={4}
                      maxLength={4000}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="schedule-start">Starts</FieldLabel>
                      <Input
                        id="schedule-start"
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(event) => set("startsAt", event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="schedule-end">Ends</FieldLabel>
                      <Input
                        id="schedule-end"
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(event) => set("endsAt", event.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="schedule-location">Location</FieldLabel>
                    <Input
                      id="schedule-location"
                      value={form.location}
                      onChange={(event) => set("location", event.target.value)}
                      maxLength={200}
                      placeholder="Room, building or online link"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Activity type</FieldLabel>
                      <OptionSelect
                        label="Activity type"
                        items={KIND_OPTIONS}
                        value={form.kind}
                        onValueChange={(value) => set("kind", value as ScheduleKind)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Audience</FieldLabel>
                      <OptionSelect
                        label="Audience"
                        items={AUDIENCE_OPTIONS}
                        value={form.audience}
                        onValueChange={(value) => set("audience", value as ScheduleAudience)}
                      />
                      <FieldDescription>
                        Only authorized users receive private activities.
                      </FieldDescription>
                    </Field>
                  </div>
                  <Field orientation="horizontal">
                    <Switch
                      id="schedule-required"
                      checked={form.required}
                      onCheckedChange={(checked) => set("required", checked)}
                    />
                    <FieldLabel htmlFor="schedule-required">Attendance is mandatory</FieldLabel>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              {editingId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Cancel editing
                </Button>
              )}
              <Button type="submit" form="schedule-item-form" disabled={save.isPending}>
                {save.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : editingId ? (
                  <Save data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {editingId ? "Save activity" : "Add activity"}
              </Button>
            </CardFooter>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Audience rules</CardTitle>
              <CardDescription>Calendar feeds apply these rules on every refresh.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                <strong>Everyone:</strong> visible publicly and in the public ICS feed.
              </p>
              <p>
                <strong>Participants:</strong> registered accounts only.
              </p>
              <p>
                <strong>Coaches:</strong> appointed event coaches/judges only.
              </p>
              <p>
                <strong>Organizers:</strong> this event’s managers only.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section
        title="Scheduled activities"
        description="Cancelled activities stay in the feed so calendar clients can remove them."
      >
        <ScheduleList
          loading={scheduleQuery.isLoading}
          rows={rows}
          onEdit={edit}
          onCancel={(itemId) => cancel.mutate(itemId)}
          onRestore={(itemId) => restore.mutate(itemId)}
          pending={cancel.isPending || restore.isPending}
        />
      </Section>
    </div>
  );
}

function OptionSelect({
  label,
  items,
  value,
  onValueChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => onValueChange(String(next))}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ScheduleList({
  loading,
  rows,
  onEdit,
  onCancel,
  onRestore,
  pending,
}: {
  loading: boolean;
  rows: ScheduleRow[];
  onEdit: (item: ScheduleRow) => void;
  onCancel: (itemId: string) => void;
  onRestore: (itemId: string) => void;
  pending: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>No activity scheduled</EmptyTitle>
          <EmptyDescription>
            Add the launch, workshops, deadlines and final presentations.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((item) => (
        <li key={item.id}>
          <Card size="sm" className="h-full">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>
                    {SCHEDULE_KIND_LABELS[item.kind as ScheduleKind] ?? item.kind}
                  </CardDescription>
                </div>
                <Badge variant={item.status === "cancelled" ? "destructive" : "outline"}>
                  {item.status === "cancelled"
                    ? "Cancelled"
                    : SCHEDULE_AUDIENCE_LABELS[item.audience as ScheduleAudience]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="flex items-center gap-2">
                <Clock className="text-muted-foreground size-4" /> {formatDateTime(item.startsAt)} –{" "}
                {formatDateTime(item.endsAt)}
              </p>
              {item.location && (
                <p className="flex items-center gap-2">
                  <MapPin className="text-muted-foreground size-4" /> {item.location}
                </p>
              )}
              {item.description && (
                <p className="text-muted-foreground line-clamp-3">{item.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {SCHEDULE_AUDIENCE_LABELS[item.audience as ScheduleAudience]}
                </Badge>
                <Badge variant={item.required ? "default" : "outline"}>
                  {item.required ? "Mandatory" : "Optional"}
                </Badge>
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
              {item.status === "cancelled" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onRestore(item.id)}
                >
                  <RotateCcw data-icon="inline-start" /> Restore
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                    <Ban data-icon="inline-start" /> Cancel
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this activity?</AlertDialogTitle>
                      <AlertDialogDescription>
                        “{item.title}” will be marked as cancelled and propagated to subscribed
                        calendars.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep activity</AlertDialogCancel>
                      <Button
                        variant="destructive"
                        disabled={pending}
                        onClick={() => onCancel(item.id)}
                      >
                        <Ban data-icon="inline-start" /> Cancel activity
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
