"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileSearch, Pencil, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
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
import { Textarea } from "@juryza/ui/components/ui/textarea";

import { Section } from "@/components/page";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { eventKey } from "@/lib/queries";
import type { EventDocument, EventResource, Json } from "@/lib/types";

type DocumentItem = Json<EventDocument> & { creatorName: string | null };
type ResourceItem = Json<EventResource>;

const RESOURCE_KINDS = [
  { value: "scope", label: "Scope under study" },
  { value: "accessible", label: "Accessible resource" },
  { value: "tool", label: "Authorized tool" },
];
const ACCESS_LEVELS = [
  { value: "public", label: "Public" },
  { value: "event", label: "Participants & coaches" },
  { value: "restricted", label: "Restricted / ask the owner" },
];
const AVAILABILITY = [
  { value: "available", label: "Available" },
  { value: "limited", label: "Limited" },
  { value: "unavailable", label: "Unavailable" },
];

type ResourceForm = {
  kind: string;
  name: string;
  category: string;
  description: string;
  url: string;
  accessLevel: string;
  availability: string;
  ownerName: string;
  position: string;
};

const EMPTY_RESOURCE: ResourceForm = {
  kind: "scope",
  name: "",
  category: "",
  description: "",
  url: "",
  accessLevel: "event",
  availability: "available",
  ownerName: "",
  position: "0",
};

const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

export default function EventWorkspacePage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [findings, setFindings] = useState("");
  const [problems, setProblems] = useState("");
  const [resourceForm, setResourceForm] = useState<ResourceForm>(EMPTY_RESOURCE);
  const [editingId, setEditingId] = useState<string | null>(null);

  const documentQuery = useQuery({
    queryKey: [...eventKey(slug), "documents"],
    queryFn: () =>
      api.get<{ documents: DocumentItem[]; current: DocumentItem | null }>(
        `/api/events/${slug}/documents`
      ),
  });
  const resourceQuery = useQuery({
    queryKey: [...eventKey(slug), "resources"],
    queryFn: () => api.get<{ resources: ResourceItem[] }>(`/api/events/${slug}/resources`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: eventKey(slug) });
  const replaceDocument = useMutation({
    mutationFn: () =>
      api.post<{ id: string; version: number }>(`/api/events/${slug}/documents`, {
        title: title.trim(),
        url: url.trim(),
        summary: summary.trim() || null,
        findings: lines(findings),
        problems: lines(problems),
      }),
    onSuccess: async (result) => {
      toast.success(`Audit version ${result.version} published`);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const saveResource = useMutation({
    mutationFn: () => {
      const payload = {
        ...resourceForm,
        description: resourceForm.description.trim() || null,
        url: resourceForm.url.trim() || null,
        ownerName: resourceForm.ownerName.trim() || null,
        name: resourceForm.name.trim(),
        category: resourceForm.category.trim(),
        position: Number(resourceForm.position) || 0,
      };
      return editingId
        ? api.patch(`/api/resources/${editingId}`, payload)
        : api.post(`/api/events/${slug}/resources`, payload);
    },
    onSuccess: async () => {
      toast.success(editingId ? "Resource updated" : "Resource added");
      setEditingId(null);
      setResourceForm(EMPTY_RESOURCE);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeResource = useMutation({
    mutationFn: (resourceId: string) => api.delete(`/api/resources/${resourceId}`),
    onSuccess: async () => {
      toast.success("Resource deleted");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const current = documentQuery.data?.current;
  const resources = resourceQuery.data?.resources ?? [];
  const setResource = (key: keyof ResourceForm, value: string) =>
    setResourceForm((currentForm) => ({ ...currentForm, [key]: value }));

  const editResource = (resource: ResourceItem) => {
    setEditingId(resource.id);
    setResourceForm({
      kind: resource.kind,
      name: resource.name,
      category: resource.category,
      description: resource.description ?? "",
      url: resource.url ?? "",
      accessLevel: resource.accessLevel,
      availability: resource.availability,
      ownerName: resource.ownerName ?? "",
      position: String(resource.position),
    });
  };

  const useCurrentDocument = () => {
    if (!current) return;
    setTitle(current.title);
    setUrl(current.url);
    setSummary(current.summary ?? "");
    setFindings(current.findings.join("\n"));
    setProblems(current.problems.join("\n"));
  };

  return (
    <div className="flex flex-col gap-8">
      <Alert>
        <ShieldAlert />
        <AlertTitle>Do not store credentials here</AlertTitle>
        <AlertDescription>
          Add documentation and access instructions only. Passwords, API keys, tokens and URLs with
          embedded credentials are not accepted.
        </AlertDescription>
      </Alert>

      <Section
        title="Initial audit"
        description="Publishing a replacement creates a new version and preserves every previous document."
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>{current ? "Publish a replacement" : "Publish the audit"}</CardTitle>
              <CardDescription>
                Link to a read-only document and provide its manually curated overview.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                id="audit-document-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  replaceDocument.mutate();
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="audit-title">Document title</FieldLabel>
                    <Input
                      id="audit-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Initial audit — Contoso SA"
                      maxLength={120}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="audit-url">Read-only document URL</FieldLabel>
                    <Input
                      id="audit-url"
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://…"
                      required
                    />
                    <FieldDescription>
                      Use an HTTP(S) link without embedded credentials.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="audit-summary">Company presentation</FieldLabel>
                    <Textarea
                      id="audit-summary"
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      placeholder="Briefly present the simulated company and its context."
                      rows={4}
                    />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="audit-findings">Main findings</FieldLabel>
                      <Textarea
                        id="audit-findings"
                        value={findings}
                        onChange={(event) => setFindings(event.target.value)}
                        placeholder="One finding per line"
                        rows={6}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="audit-problems">Identified problems</FieldLabel>
                      <Textarea
                        id="audit-problems"
                        value={problems}
                        onChange={(event) => setProblems(event.target.value)}
                        placeholder="One problem per line"
                        rows={6}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-2 border-t">
              <Button
                type="button"
                variant="ghost"
                onClick={useCurrentDocument}
                disabled={!current}
              >
                Use current values
              </Button>
              <Button
                type="submit"
                form="audit-document-form"
                disabled={replaceDocument.isPending || title.trim().length < 2 || !url.trim()}
              >
                {replaceDocument.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                {current ? "Publish replacement" : "Publish audit"}
              </Button>
            </CardFooter>
          </Card>

          <DocumentHistory
            loading={documentQuery.isLoading}
            documents={documentQuery.data?.documents ?? []}
          />
        </div>
      </Section>

      <Section
        title="Perimeter and resources"
        description="Separate the studied scope, usable resources and authorized tools."
      >
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="xl:sticky xl:top-20 xl:self-start">
            <CardHeader>
              <CardTitle>{editingId ? "Edit resource" : "Add a resource"}</CardTitle>
              <CardDescription>
                Links with embedded usernames or passwords are rejected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResourceFormFields form={resourceForm} setResource={setResource} />
            </CardContent>
            <CardFooter className="flex-wrap justify-end gap-2 border-t">
              {editingId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setResourceForm(EMPTY_RESOURCE);
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={() => saveResource.mutate()}
                disabled={
                  saveResource.isPending ||
                  resourceForm.name.trim().length < 2 ||
                  resourceForm.category.trim().length < 2
                }
              >
                {saveResource.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : editingId ? (
                  <Save data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {editingId ? "Save resource" : "Add resource"}
              </Button>
            </CardFooter>
          </Card>

          <ResourceList
            loading={resourceQuery.isLoading}
            resources={resources}
            onEdit={editResource}
            onDelete={(resourceId) => removeResource.mutate(resourceId)}
            deleting={removeResource.isPending}
          />
        </div>
      </Section>
    </div>
  );
}

function DocumentHistory({ loading, documents }: { loading: boolean; documents: DocumentItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Document history</CardTitle>
        <CardDescription>Original versions remain available to organizers.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ) : documents.length ? (
          <ol className="flex flex-col gap-3">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{document.title}</p>
                    <p className="text-muted-foreground text-xs">
                      Version {document.version} · {formatDateTime(document.createdAt)}
                    </p>
                  </div>
                  {document.isCurrent && <Badge>Current</Badge>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  nativeButton={false}
                  render={<a href={document.url} target="_blank" rel="noreferrer" />}
                >
                  Open document <ExternalLink data-icon="inline-end" />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileSearch />
              </EmptyMedia>
              <EmptyTitle>No audit document</EmptyTitle>
              <EmptyDescription>
                The first published document will become version 1.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function ResourceFormFields({
  form,
  setResource,
}: {
  form: ResourceForm;
  setResource: (key: keyof ResourceForm, value: string) => void;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Resource group</FieldLabel>
        <OptionSelect
          label="Resource group"
          items={RESOURCE_KINDS}
          value={form.kind}
          onValueChange={(value) => setResource("kind", value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="resource-name">Name</FieldLabel>
        <Input
          id="resource-name"
          value={form.name}
          onChange={(event) => setResource("name", event.target.value)}
          maxLength={120}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="resource-category">Category</FieldLabel>
        <Input
          id="resource-category"
          value={form.category}
          onChange={(event) => setResource("category", event.target.value)}
          placeholder="API, database, documentation…"
          maxLength={80}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="resource-description">Description</FieldLabel>
        <Textarea
          id="resource-description"
          value={form.description}
          onChange={(event) => setResource("description", event.target.value)}
          rows={3}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="resource-url">Optional URL</FieldLabel>
        <Input
          id="resource-url"
          type="url"
          value={form.url}
          onChange={(event) => setResource("url", event.target.value)}
          placeholder="https://…"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Access level</FieldLabel>
          <OptionSelect
            label="Access level"
            items={ACCESS_LEVELS}
            value={form.accessLevel}
            onValueChange={(value) => setResource("accessLevel", value)}
          />
        </Field>
        <Field>
          <FieldLabel>Availability</FieldLabel>
          <OptionSelect
            label="Availability"
            items={AVAILABILITY}
            value={form.availability}
            onValueChange={(value) => setResource("availability", value)}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="resource-owner">Responsible person</FieldLabel>
        <Input
          id="resource-owner"
          value={form.ownerName}
          onChange={(event) => setResource("ownerName", event.target.value)}
          maxLength={120}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="resource-position">Display position</FieldLabel>
        <Input
          id="resource-position"
          type="number"
          min={0}
          max={10_000}
          value={form.position}
          onChange={(event) => setResource("position", event.target.value)}
        />
      </Field>
    </FieldGroup>
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

function ResourceList({
  loading,
  resources,
  onEdit,
  onDelete,
  deleting,
}: {
  loading: boolean;
  resources: ResourceItem[];
  onEdit: (resource: ResourceItem) => void;
  onDelete: (resourceId: string) => void;
  deleting: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (!resources.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Plus />
          </EmptyMedia>
          <EmptyTitle>No resource yet</EmptyTitle>
          <EmptyDescription>Add the first item in the Innovation Lab perimeter.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {resources.map((resource) => (
        <li key={resource.id}>
          <Card size="sm" className="h-full">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{resource.name}</CardTitle>
                  <CardDescription>{resource.category}</CardDescription>
                </div>
                <Badge variant="outline">{resource.kind}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {resource.description && (
                <p className="text-muted-foreground">{resource.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{resource.accessLevel}</Badge>
                <Badge
                  variant={resource.availability === "unavailable" ? "destructive" : "outline"}
                >
                  {resource.availability}
                </Badge>
              </div>
              {resource.ownerName && (
                <p className="text-muted-foreground text-xs">Owner: {resource.ownerName}</p>
              )}
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => onEdit(resource)}>
                <Pencil data-icon="inline-start" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                  <Trash2 data-icon="inline-start" /> Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this resource?</AlertDialogTitle>
                    <AlertDialogDescription>
                      “{resource.name}” will disappear from the participant dashboard.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      disabled={deleting}
                      onClick={() => onDelete(resource.id)}
                    >
                      {deleting ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Trash2 data-icon="inline-start" />
                      )}
                      Delete
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
