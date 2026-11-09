import type { Metadata } from "next";
import Link from "next/link";

import { CalendarRange, Gavel, Rocket, Trophy, UsersRound, Vote } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Button } from "@juryza/ui/components/ui/button";
import { Card, CardContent } from "@juryza/ui/components/ui/card";

import { DocHeader, DocSection, KeyValue, Pill, Prose, Step, Steps } from "../docs-prose";

export const metadata: Metadata = {
  title: "Tutorial — Juryza docs",
  description: "How to use Juryza as a participant, a judge, and an organizer.",
};

/** A task-oriented walkthrough of the three roles that use Juryza. */
export default function GuidePage() {
  return (
    <div className="flex flex-col gap-10">
      <DocHeader
        eyebrow="Tutorial"
        title="Using Juryza"
        lead="Every screen in Juryza is built on the public API, and the server enforces who can do what on every call. This guide follows the three people in a hackathon: the participant who ships, the judge who scores, and the organizer who runs it."
      />

      <DocSection title="The lifecycle" icon={CalendarRange}>
        <Prose>
          An event moves through phases derived from its dates — never a stored flag — so deadlines
          and the timeline can never disagree. Each phase unlocks different actions.
        </Prose>
        <KeyValue
          items={[
            {
              term: "Upcoming",
              detail:
                "Before submissions open. The event page is live; nothing can be submitted yet.",
            },
            {
              term: "Submissions",
              detail:
                "Teams form, projects are created and edited, and submitted before the deadline.",
            },
            {
              term: "Judging",
              detail: "The panel scores assigned projects against the weighted rubric.",
            },
            {
              term: "Community voting",
              detail: "An optional public vote runs in its own window; it can overlap judging.",
            },
            {
              term: "Results",
              detail:
                "Once the organizer publishes, the leaderboard, awards and certificates appear.",
            },
          ]}
        />
      </DocSection>

      <DocSection title="For participants" icon={Rocket}>
        <Prose>Ship a project and put it in front of the judges.</Prose>
        <Steps>
          <Step index={1} title="Create an account and register">
            Sign up, then open the event and register. Creating or joining a team registers you
            automatically.
          </Step>
          <Step index={2} title="Form or join a team">
            Start a team and share its invite link, or join one with a link. One team per person per
            event; teams lock at the submission deadline so rosters cannot be reshuffled once
            judging starts.
          </Step>
          <Step index={3} title="Build your project page">
            Add a title, tagline, write-up, repo, live URL, demo video and tech tags. The write-up
            is rich text stored safely as structured content.
          </Step>
          <Step index={4} title="Submit before the deadline">
            Submitting is enforced by the server against the clock — a late submission is refused no
            matter what the browser says. You can keep editing until the deadline.
          </Step>
          <Step index={5} title="Follow results">
            After the organizer publishes, your placement, any awards and your certificate appear on
            the event and on your public profile.
          </Step>
        </Steps>
        <Alert>
          <UsersRound />
          <AlertTitle>Looking for a team?</AlertTitle>
          <AlertDescription>
            Mark yourself “looking for a team” on your profile, or a team as “looking for members”,
            so others can find you before the deadline.
          </AlertDescription>
        </Alert>
      </DocSection>

      <DocSection title="For judges" icon={Gavel}>
        <Prose>
          Judges only ever see the projects assigned to them — cross-judge reads are refused by the
          backend, not just hidden in the UI.
        </Prose>
        <Steps>
          <Step index={1} title="Accept the panel invitation">
            The organizer invites you by email; the link is bound to that address, so a forwarded
            link will not work for another account.
          </Step>
          <Step index={2} title="Open your queue">
            Your assignments appear in Judging. You only receive projects assigned to you, and never
            a project from a team you belong to. From the jury panel, you may also invite another
            judge.
          </Step>
          <Step index={3} title="Score against the rubric">
            Give an integer 1–5 for every criterion. Partial scores are refused; the weighted
            aggregate and the cross-judge normalization are computed on read, so re-weighting never
            leaves stale numbers behind.
          </Step>
          <Step index={4} title="Or judge pairwise">
            Some events use pairwise judging: pick the better of two projects and a Bradley–Terry
            model ranks them. This needs no calibration and is a good cross-check on rubric scores.
          </Step>
        </Steps>
        <Alert>
          <Gavel />
          <AlertTitle>Calibration is automatic</AlertTitle>
          <AlertDescription>
            Generous, harsh and flat judges are corrected with a per-judge z-score, then mapped back
            to the 1–5 scale. The maths and its limits are in the{" "}
            <Link href="/docs/about#judging" className="text-primary underline underline-offset-4">
              project doc
            </Link>
            .
          </AlertDescription>
        </Alert>
      </DocSection>

      <DocSection title="For organizers" icon={Trophy}>
        <Prose>Set up the event, run judging, and publish results.</Prose>
        <Steps>
          <Step index={1} title="Create the event">
            Set the name, dates, prizes and the weighted rubric. Draft events are visible only to
            you until you publish.
          </Step>
          <Step index={2} title="Build the judging panel">
            Invite judges by email. Judges already on the panel may invite additional judges. Then
            generate assignments — balanced (every project gets the same number of reviews) or batch
            (contiguous chunks per judge), with a dry-run preview.
          </Step>
          <Step index={3} title="Configure community voting">
            Optionally open a public vote. Choose the access mode and strength — see the{" "}
            <Link href="/docs/voting" className="text-primary underline underline-offset-4">
              voting-integrity guide
            </Link>{" "}
            for how to keep it clean.
          </Step>
          <Step index={4} title="Watch the integrity dashboard">
            Voters by kind, voters sharing a network, burst minutes, and a full audit log are all
            visible and exportable while the event runs.
          </Step>
          <Step index={5} title="Publish results">
            Publishing is refused while voting is open, so a live vote can never see standings. On
            publish, the leaderboard, awards and signed certificates go live.
          </Step>
        </Steps>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                <Vote className="text-primary size-4" /> Import & export
              </span>
              <p className="text-muted-foreground text-sm">
                Every stage exports to CSV or JSON, and a bundle re-imports — so a whole event can
                move between instances.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                <Rocket className="text-primary size-4" /> API-first
              </span>
              <p className="text-muted-foreground text-sm">
                Anything a screen can do, a script can do with a personal token. Start from the{" "}
                <Link href="/docs/api" className="text-primary underline underline-offset-4">
                  API reference
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </DocSection>

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Pill tone="primary">Next</Pill>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/docs/voting" />}
        >
          Voting integrity
        </Button>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/docs/api" />}>
          API reference
        </Button>
      </div>
    </div>
  );
}
