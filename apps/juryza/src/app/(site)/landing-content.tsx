"use client";

import Link from "next/link";

import { ArrowRight, ClipboardCheck, Lightbulb, Presentation, UsersRound } from "lucide-react";

import { Badge } from "@juryza/ui/components/ui/badge";
import { Button } from "@juryza/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@juryza/ui/components/ui/card";

import { EventCover } from "@/components/event-bits";
import { useI18n } from "@/components/locale-provider";
import { formatRange } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";

interface LandingEvent {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  hue: number;
  submissionsOpen: string | null;
  submissionsClose: string;
  participants: number;
  projects: number;
}

const STEP_ICONS = [Presentation, Lightbulb, UsersRound, ClipboardCheck] as const;

export function LandingContent({ events }: { events: LandingEvent[] }) {
  const { t } = useI18n();
  const steps = [1, 2, 3, 4].map((number, index) => ({
    number,
    icon: STEP_ICONS[index] ?? Lightbulb,
    title: t(`home.step${number}.title` as TranslationKey),
    text: t(`home.step${number}.text` as TranslationKey),
  }));

  return (
    <div className="flex flex-col">
      <section className="border-b">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_420px]">
          <div className="flex max-w-3xl flex-col items-start gap-6">
            <Badge variant="secondary">{t("home.badge")}</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t("home.title")}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
              {t("home.description")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/events" />}>
                {t("home.openEvents")} <ArrowRight data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<Link href="/dashboard" />}
              >
                {t("home.openDashboard")}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("home.createEvent")}</CardTitle>
              <CardDescription>{t("home.step1.text")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" nativeButton={false} render={<Link href="/manage/new" />}>
                {t("home.createEvent")} <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="parcours" className="bg-muted/30 scroll-mt-20 border-b">
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {steps.map((step) => (
            <Card key={step.number} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <step.icon className="text-primary size-5" />
                  <span className="text-muted-foreground text-sm tabular-nums">{step.number}/4</span>
                </div>
                <CardTitle>{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{step.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">{t("home.currentEvents")}</h2>
          <Button variant="outline" nativeButton={false} render={<Link href="/events" />}>
            {t("home.openEvents")}
          </Button>
        </div>
        {events.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            {t("home.noEvents")}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {events.map((event) => (
              <Card key={event.id} className="gap-0 overflow-hidden py-0">
                <EventCover hue={event.hue} className="h-24" />
                <CardHeader>
                  <CardTitle>{event.name}</CardTitle>
                  {event.tagline ? <CardDescription>{event.tagline}</CardDescription> : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pb-5">
                  <p className="text-muted-foreground text-sm">
                    {formatRange(event.submissionsOpen, event.submissionsClose)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {event.participants} {t("event.participants")} · {event.projects}{" "}
                    {t("event.projects").toLowerCase()}
                  </p>
                  <Button nativeButton={false} render={<Link href={`/e/${event.slug}`} />}>
                    {t("home.openEvent")} <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

