"use client";

import { useEffect, useState } from "react";

import {
  CalendarClock,
  CheckCircle2,
  Gavel,
  Lightbulb,
  Rocket,
  UsersRound,
  Vote,
} from "lucide-react";

import { Badge } from "@juryza/ui/components/ui/badge";
import { cn } from "@juryza/ui/lib/utils";

import { relativeTime } from "@/lib/format";
import { type EventDates, milestones, PHASE_LABEL, type Phase, phaseOf } from "@/lib/phase";

/**
 * Small, reusable pieces of event UI: the cover gradient, the lifecycle badge,
 * a live countdown to the next milestone, and a timeline.
 */

/** A decorative gradient derived from the event's hue (data-driven, not a theme colour). */
export function coverStyle(hue: number): React.CSSProperties {
  return {
    backgroundImage: `radial-gradient(120% 120% at 0% 0%, oklch(0.72 0.16 ${hue}) 0%, transparent 55%), radial-gradient(120% 120% at 100% 100%, oklch(0.6 0.2 ${(hue + 60) % 360}) 0%, transparent 60%), linear-gradient(135deg, oklch(0.45 0.18 ${hue}), oklch(0.32 0.12 ${(hue + 30) % 360}))`,
  };
}

export function EventCover({
  hue,
  className,
  children,
}: {
  hue: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={coverStyle(hue)}>
      <div
        className="absolute inset-0 opacity-25 mix-blend-overlay"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.15) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {children}
    </div>
  );
}

const PHASE_ICON: Record<Phase, React.ComponentType<{ className?: string }>> = {
  upcoming: CalendarClock,
  pitching: Lightbulb,
  "pitch-voting": Vote,
  "team-formation": UsersRound,
  submissions: Rocket,
  judging: Gavel,
  voting: Vote,
  results: CheckCircle2,
};

export function PhaseBadge({ event, className }: { event: EventDates; className?: string }) {
  const phase = phaseOf(event);
  const Icon = PHASE_ICON[phase];
  return (
    <Badge
      variant={
        phase === "pitching" ||
        phase === "pitch-voting" ||
        phase === "submissions" ||
        phase === "voting"
          ? "default"
          : "secondary"
      }
      className={cn("gap-1", className)}
    >
      <Icon className="size-3" />
      {PHASE_LABEL[phase]}
    </Badge>
  );
}

/** "Submissions close in 3 days" — re-renders every minute. */
export function NextMilestone({ event, className }: { event: EventDates; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const next = milestones(event).find((m) => m.at.getTime() > now);
  if (!next) return null;
  return (
    <span className={cn("text-muted-foreground text-sm", className)}>
      {next.label} {relativeTime(next.at, now)}
    </span>
  );
}

export function Timeline({ event }: { event: EventDates }) {
  const now = Date.now();
  const items = milestones(event);
  return (
    <ol className="relative flex flex-col gap-5 border-l pl-5">
      {items.map((m) => {
        const past = m.at.getTime() <= now;
        return (
          <li key={m.key} className="relative">
            <span
              className={cn(
                "absolute top-1 -left-[1.6rem] size-3 rounded-full border-2",
                past ? "border-primary bg-primary" : "border-border bg-background"
              )}
            />
            <p className={cn("text-sm font-medium", !past && "text-muted-foreground")}>{m.label}</p>
            <p className="text-muted-foreground text-xs">
              {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                m.at
              )}{" "}
              · {relativeTime(m.at, now)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
