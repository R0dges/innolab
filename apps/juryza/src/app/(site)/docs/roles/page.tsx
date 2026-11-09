import type { Metadata } from "next";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Crown,
  EyeOff,
  Gavel,
  KeyRound,
  Lock,
  Minus,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@juryza/ui/components/ui/alert";
import { Badge } from "@juryza/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@juryza/ui/components/ui/card";
import { Kbd } from "@juryza/ui/components/ui/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@juryza/ui/components/ui/table";

import { DocHeader, DocSection, KeyValue, Pill, Prose } from "../docs-prose";

export const metadata: Metadata = {
  title: "Roles & Permissions — Juryza docs",
  description:
    "Comprehensive guide to what participants, judges, organizers, and admins can and should do in Juryza.",
};

/** A comprehensive reference for Juryza's role model and permissions. */
export default function RolesDocsPage() {
  return (
    <div className="flex flex-col gap-12">
      <DocHeader
        eyebrow="Access & Governance"
        title="Roles, Responsibilities & Permissions"
        lead="Juryza enforces a strict two-tier role architecture: platform-level account capabilities and event-level scope. Every user has a defined role, clear responsibilities, and hard cryptographic boundaries enforced on every API route."
      />

      {/* Two-Tier Architecture */}
      <DocSection title="The Two-Tier Role Architecture" icon={Shield}>
        <Prose>
          Permissions are evaluated at two distinct layers. Platform roles define account
          capabilities across Juryza, while event roles isolate administrative control to specific
          hackathons. An organizer cannot touch another organizer's event, and a judge only sees
          submissions assigned to their blind queue.
        </Prose>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="size-4 text-primary" /> 1. Platform Role
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm flex flex-col gap-2">
              <p>Stored on the user record in order of ascending authority:</p>
              <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                <Badge variant="outline">visitor</Badge>
                <span>&lt;</span>
                <Badge variant="outline">participant</Badge>
                <span>&lt;</span>
                <Badge variant="outline">judge</Badge>
                <span>&lt;</span>
                <Badge variant="outline">organizer</Badge>
                <span>&lt;</span>
                <Badge variant="secondary" className="border-primary/40 bg-primary/10 text-primary">
                  admin
                </Badge>
              </div>
              <p className="text-xs">
                A higher role inherits platform-wide abilities below it. For example, an organizer
                can also participate as a builder or act as a judge.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="size-4 text-emerald-500" /> 2. Event-Level Scopes
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm flex flex-col gap-2">
              <p>Strict multi-tenant security evaluated per event:</p>
              <ul className="list-disc pl-4 text-xs space-y-1">
                <li>
                  <strong className="text-foreground">Event Creator / Manager:</strong> Only the
                  creator (or platform admin) can manage an event.
                </li>
                <li>
                  <strong className="text-foreground">Panel Judge:</strong> A user explicitly added
                  to the event's judge roster (<code className="text-[11px]">event_judge</code>).
                </li>
                <li>
                  <strong className="text-foreground">Team Member:</strong> Registered builder tied
                  to an active submission.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </DocSection>

      {/* Role Deep-Dives */}
      <DocSection title="Participant: Builders & Hackers" icon={Users}>
        <Prose>
          Participants are the innovators of the hackathon ecosystem. They form teams, build
          projects, submit deliverables, allocate community votes, and climb the platform rankings.
        </Prose>

        <Card className="border-border/60">
          <CardContent className="p-5 flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">
                What Participants CAN Do:
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Register for any open hackathon with one click</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Create teams or join existing teams via secret invite links</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Submit projects with live demo URLs, code repositories, videos, and rich TipTap
                    writeups
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Participate in Quadratic Community Voting (allocating credits)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Leave constructive feedback and ask questions on other project galleries
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Curate their public builder profile with custom handle, bio, and social links
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold text-foreground mb-1">
                What Participants CANNOT Do (Enforced Safeguards):
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <strong>No Self-Voting:</strong> Cannot allocate quadratic votes to their own
                    team's project
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <strong>No Scoring Access:</strong> Cannot view raw judge marks or uncalibrated
                    scoring sheets
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <strong>Deadline Lock:</strong> Cannot edit submission content after the event
                    submission window closes
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <strong>No Event Mutation:</strong> Cannot change event timelines, rubrics, or
                    prize categories
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </DocSection>

      <DocSection title="Judge: Impartial Evaluation & Pairwise Arena" icon={Gavel}>
        <Prose>
          Judges are domain experts, engineers, and sponsors invited to evaluate submissions. Juryza
          protects judges from bias through automated blind queue isolation and mathematical
          normalization.
        </Prose>

        <Card className="border-border/60">
          <CardContent className="p-5 flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">
                What Judges CAN & SHOULD Do:
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Access the dedicated <strong>Scoring Console</strong> (
                    <code className="text-[11px]">/judging/[slug]</code>)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Score assigned projects against weighted multi-criteria rubrics (1–5 scale)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Compete in the <strong>Pairwise Duel Arena</strong> using active Bradley–Terry
                    comparisons
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Leave private evaluation notes and constructive feedback for team creators
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Quickly undo or skip pairwise matchups with keyboard shortcuts (<Kbd>Z</Kbd>,{" "}
                    <Kbd>S</Kbd>)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    View their personal calibration stats (mean offset, dispersion, scoring
                    consistency)
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold text-foreground mb-1">
                Judge Privacy & Security Invariants:
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <EyeOff className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong>Blind Queue Isolation:</strong> Judge B can never view Judge A's scores
                    or feedback
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Conflict of Interest (COI) Quarantine:</strong> Judges are forbidden
                    from evaluating their own projects
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong>Pre-Publication Secrecy:</strong> Cannot view overall aggregate ranking
                    before official publication
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <strong>No Arbitrary Editing:</strong> Cannot modify rubrics, weights, or
                    project code
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </DocSection>

      <DocSection title="Organizer: Event Orchestration & Defensible Results" icon={Scale}>
        <Prose>
          Organizers design the competition, configure the rubric, invite the panel, run review
          distribution algorithms, and publish mathematically defensible results.
        </Prose>

        <Card className="border-border/60">
          <CardContent className="p-5 flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">
                What Organizers CAN & SHOULD Do:
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Create events and set lifecycle timeline milestones (Upcoming, Submissions,
                    Judging, Voting, Results)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Define prize pools and weighted custom scoring criteria</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Invite the panel judges who will evaluate the assigned projects</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Run the <strong>Automated Review Assignment Algorithm</strong> to balance
                    judging loads
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Inspect z-score normalized scores, judge harshness flags, and pairwise
                    Bradley–Terry models
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Assign podium positions and publish results to lock judging data</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Export full CSV/JSON datasets (scores, comments, calibration, audit logs)
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold text-foreground mb-1">
                Organizer Scope Boundaries:
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Lock className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong>Tenant Isolation:</strong> An organizer has zero administrative power
                    over other organizers' hackathons
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong>Immutability on Publish:</strong> Once results are published, scores and
                    pairwise verdicts are permanently locked
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <strong>No System Access:</strong> Cannot ban accounts, edit platform database
                    schemas, or alter platform configs
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </DocSection>

      <DocSection title="Admin: Platform Superuser & Integrity Audit" icon={ShieldAlert}>
        <Prose>
          Admins hold platform-wide operational authority. They maintain system integrity, resolve
          disputes, moderate abusive behavior, and oversee compliance across all events.
        </Prose>

        <Card className="border-border/60">
          <CardContent className="p-5 flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">What Admins CAN Do:</h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Manage all users on the platform (
                    <code className="text-[11px]">/admin/users</code>)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Promote or demote user roles (
                    <Badge variant="outline" className="text-[10px]">
                      participant
                    </Badge>{" "}
                    &rarr;{" "}
                    <Badge variant="outline" className="text-[10px]">
                      judge
                    </Badge>{" "}
                    &rarr;{" "}
                    <Badge variant="outline" className="text-[10px]">
                      organizer
                    </Badge>{" "}
                    &rarr;{" "}
                    <Badge variant="outline" className="text-[10px]">
                      admin
                    </Badge>
                    )
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Suspend or ban abusive accounts (instantly revoking sessions and API access)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Access and manage any hackathon on the platform for moderation or dispute
                    support
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    Inspect immutable platform audit trails (
                    <code className="text-[11px]">/admin/audit</code>) with IP and actor details
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold text-foreground mb-1">
                Admin Audit & Accountability:
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Superuser powers are not invisible. Every administrative action (role escalation,
                ban, override, or audit query) is recorded permanently in the append-only audit log
                with timestamp, actor identity, target ID, and IP address for compliance.
              </p>
            </div>
          </CardContent>
        </Card>
      </DocSection>

      {/* Comprehensive Permissions Matrix */}
      <DocSection title="Comprehensive Permissions Matrix" icon={KeyRound}>
        <Prose>
          A side-by-side comparison of every platform action across all five roles. Badges indicate
          scoped permissions or conditional access rules.
        </Prose>

        {/* Matrix Terms & Conditions Legend */}
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-border/60 bg-card/60 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Pill tone="muted">Open Mode</Pill>
              <span>Community Voting</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              In Juryza, hackathons configure Community Voting Access as <strong>Open</strong>,{" "}
              <strong>Authenticated</strong>, or <strong>Registered</strong>. In{" "}
              <strong className="text-foreground">Open Mode</strong>, anyone with a web browser
              (even unauthenticated visitors) receives an anonymous voter token and can allocate
              quadratic vote credits. In Authenticated mode, users must sign in; in Registered mode,
              only accepted hackathon participants may vote.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Pill tone="primary">Assigned</Pill>
              <span>Judging Queue</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Assigned</strong> means judges cannot pick and
              choose which projects to evaluate. Projects must be explicitly assigned to that judge
              by the organizer or the automated review balancing algorithm. Conflict-of-interest
              rules still apply. Even organizers and admins acting as judges only score their
              assigned queue.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Pill tone="primary">Own Events</Pill>
              <span>Tenant Scope</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Own Events</strong> enforces strict multi-tenant
              isolation. An organizer has complete managerial control over hackathons they
              personally created (<code className="text-[10px]">createdBy === userId</code>), but
              has zero administrative access to hackathons organized by others. Platform Admins
              retain platform-wide override capability.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[30%]">Capability / Action</TableHead>
                <TableHead className="text-center">Visitor</TableHead>
                <TableHead className="text-center">Participant</TableHead>
                <TableHead className="text-center">Judge</TableHead>
                <TableHead className="text-center">Organizer</TableHead>
                <TableHead className="text-center">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              <TableRow>
                <TableCell className="font-medium">
                  Browse public events, gallery & leaderboards
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Register for an event & join teams</TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Submit projects & edit writeups</TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Quadratic Community Voting</TableCell>
                <TableCell className="text-center">
                  <Pill tone="muted">Open Mode</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Leave feedback & questions on projects
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Score projects in blind queue (Rubric 1–5)
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Assigned</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Assigned</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Assigned</Pill>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Compete in Pairwise Duel Arena (Bradley–Terry)
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Assigned</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Assigned</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Assigned</Pill>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Create new hackathons</TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Edit event rubric, rewards & timeline</TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Own Events</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Invite judges & run automated assignments
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Own Events</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Preview z-score normalized calibration
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Own Events</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Publish defended results & lock scoring
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Own Events</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Export event datasets (CSV / JSON)</TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="primary">Own Events</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Promote/demote users & ban accounts</TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Inspect platform-wide immutable audit trail
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                </TableCell>
                <TableCell className="text-center">
                  <Pill tone="muted">Event Scope</Pill>
                </TableCell>
                <TableCell className="text-center">
                  <Check className="size-4 text-emerald-500 mx-auto" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DocSection>

      {/* Enforcement & Security Invariants */}
      <DocSection title="Security & Integrity Invariants" icon={ShieldCheck}>
        <Prose>
          Juryza does not rely on client-side security checks. Every permission is validated on the
          server inside route middleware.
        </Prose>

        <Alert className="border-primary/40 bg-primary/5">
          <ShieldAlert className="size-4 text-primary" />
          <AlertTitle className="text-sm font-semibold">Zero-Trust Server Enforcement</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
            Any attempt by an unauthorized role to mutate judging rubrics, publish results
            prematurely, vote for their own project, or inspect another judge's blind scoring queue
            is rejected with an immediate <code className="text-foreground">403 Forbidden</code> or{" "}
            <code className="text-foreground">404 Not Found</code> response. Draft events never leak
            existence.
          </AlertDescription>
        </Alert>

        <KeyValue
          items={[
            {
              term: "Blind Review Isolation",
              detail:
                "Judges score completely independently without anchoring. Judge B can never view Judge A's raw scores or feedback notes until results are officially declared.",
            },
            {
              term: "Tamper-Proof Audit Trail",
              detail:
                "Every score change, pairwise vote, role update, account suspension, and publish command records an immutable audit log entry containing the exact actor, timestamp, and network IP.",
            },
            {
              term: "Quadratic Sybil Resistance",
              detail:
                "Community voting enforces mathematical quadratic cost (n votes cost n² credits), making vote-buying and spam accounts exponentially expensive while empowering genuine conviction.",
            },
            {
              term: "Publication Lock",
              detail:
                "Once results are published, the scoring tables and pairwise records become read-only. Scores cannot be silently altered or retroactively manipulated.",
            },
          ]}
        />
      </DocSection>
    </div>
  );
}
