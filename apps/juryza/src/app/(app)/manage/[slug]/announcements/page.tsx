"use client";

/**
 * /manage/<slug>/announcements — post updates to participants (pinned ones
 * stay at the top of the event page) and remove old ones.
 */

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pin, Send, Trash2 } from "lucide-react";
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

import { RichContent } from "@/components/editor/rich-content";
import { RichEditor } from "@/components/editor/rich-editor";
import { Section } from "@/components/page";
import { api } from "@/lib/api";
import type { RichDoc } from "@/lib/db/schema";
import { formatDateTime, relativeTime } from "@/lib/format";
import { type AnnouncementItem, eventKey } from "@/lib/queries";
import { isEmptyDoc, parseRichDoc, textToDoc } from "@/lib/rich-text";

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "urgent", label: "Urgent" },
];

const AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "participants", label: "Participants" },
  { value: "coaches", label: "Coaches" },
  { value: "organizers", label: "Organizers" },
];

export default function AnnouncementsPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const listKey = [...eventKey(slug), "announcements"];
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () =>
      api.get<{ announcements: AnnouncementItem[] }>(`/api/events/${slug}/announcements`),
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<RichDoc>(() => textToDoc(""));
  const [editorKey, setEditorKey] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [priority, setPriority] = useState("normal");
  const [audience, setAudience] = useState("all");

  const refresh = () => queryClient.invalidateQueries({ queryKey: eventKey(slug) });

  const post = useMutation({
    mutationFn: () =>
      api.post(`/api/events/${slug}/announcements`, {
        title: title.trim(),
        body,
        pinned,
        priority,
        audience,
      }),
    onSuccess: async () => {
      toast.success("Announcement posted");
      setTitle("");
      setBody(textToDoc(""));
      setEditorKey((k) => k + 1);
      setPinned(false);
      setPriority("normal");
      setAudience("all");
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/announcements/${id}`),
    onSuccess: async () => {
      toast.success("Announcement deleted");
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const valid = title.trim().length >= 2 && !isEmptyDoc(body);
  const list = data?.announcements ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
          <CardDescription>
            Shown on the event page to everyone who can see the event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="announce"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) post.mutate();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input
                  id="title"
                  value={title}
                  maxLength={120}
                  placeholder="Judging starts tomorrow at 9:00"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Message</FieldLabel>
                <div className="rounded-lg border px-4 py-3">
                  <RichEditor
                    key={editorKey}
                    value={body}
                    onChange={setBody}
                    className="min-h-36"
                    placeholder="What participants need to know… Press / for blocks"
                  />
                </div>
                <FieldDescription>
                  Supports Notion-style blocks (press /), headings, lists, quotes, and markdown
                  shortcuts.
                </FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Priority</FieldLabel>
                  <Select
                    items={PRIORITIES}
                    value={priority}
                    onValueChange={(v) => setPriority(String(v))}
                  >
                    <SelectTrigger aria-label="Announcement priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PRIORITIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Audience</FieldLabel>
                  <Select
                    items={AUDIENCES}
                    value={audience}
                    onValueChange={(v) => setAudience(String(v))}
                  >
                    <SelectTrigger aria-label="Announcement audience">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {AUDIENCES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <FieldLabel htmlFor="pinned">
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>
                      <Pin className="size-3.5" /> Pin to the top
                    </FieldTitle>
                    <FieldDescription>Pinned announcements stay above newer ones.</FieldDescription>
                  </FieldContent>
                  <Switch id="pinned" checked={pinned} onCheckedChange={setPinned} />
                </Field>
              </FieldLabel>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" form="announce" disabled={!valid || post.isPending}>
            {post.isPending ? <Spinner /> : <Send />} Post announcement
          </Button>
        </CardFooter>
      </Card>

      <Section
        title="Posted"
        description={
          isLoading ? undefined : `${list.length} announcement${list.length === 1 ? "" : "s"}`
        }
      >
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : list.length ? (
          <ul className="flex flex-col gap-3">
            {list.map((a) => (
              <li key={a.id}>
                <Card className="gap-2 py-4">
                  <CardHeader className="px-4">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {a.pinned && (
                        <Badge variant="secondary">
                          <Pin /> Pinned
                        </Badge>
                      )}
                      {a.priority !== "normal" && (
                        <Badge variant={a.priority === "urgent" ? "destructive" : "outline"}>
                          {a.priority}
                        </Badge>
                      )}
                      <Badge variant="outline">{a.audience}</Badge>
                      {a.title}
                    </CardTitle>
                    <CardDescription title={formatDateTime(a.createdAt)}>
                      Posted by {a.authorName ?? "an organizer"} {relativeTime(a.createdAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4">
                    <RichContent doc={parseRichDoc(a.body)} className="text-sm" />
                  </CardContent>
                  <CardFooter className="justify-end px-4">
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                        <Trash2 /> Delete
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
                          <AlertDialogDescription>
                            “{a.title}” will disappear from the event page.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <Button
                            variant="destructive"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(a.id)}
                          >
                            {remove.isPending ? <Spinner /> : <Trash2 />} Delete
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Megaphone />
              </EmptyMedia>
              <EmptyTitle>No announcements yet</EmptyTitle>
              <EmptyDescription>
                Share schedule changes, judging updates and results reminders here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </Section>
    </div>
  );
}
