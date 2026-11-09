import {
  Award,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  Compass,
  Database,
  FileSearch,
  FolderKanban,
  Gauge,
  Gavel,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";

import type { Viewer } from "@/components/viewer";
import type { TranslationKey } from "@/lib/i18n";
import { EVENT_REWARDS_ENABLED } from "@/lib/platform";
import { hasAtLeast } from "@/lib/roles";

/** Sidebar navigation, derived from the viewer's role and judging panels. */

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

type Translator = (key: TranslationKey) => string;

export function mainNav(viewer: Viewer, t: Translator): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: t("nav.innovationLabs"),
      items: [
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, exact: true },
        { href: "/events", label: t("nav.innovationLabs"), icon: Compass },
      ],
    },
    {
      label: t("nav.participate"),
      items: [{ href: "/projects", label: t("nav.myProjects"), icon: FolderKanban }],
    },
  ];
  if (viewer.judgeEvents > 0 || viewer.role === "judge") {
    groups.push({
      label: t("nav.coach"),
      items: [{ href: "/judging", label: t("nav.evaluations"), icon: Gavel }],
    });
  }
  if (hasAtLeast(viewer.role, "judge")) {
    groups.push({
      label: t("nav.organize"),
      items: [
        { href: "/manage", label: t("nav.myEvents"), icon: Gauge, exact: true },
        { href: "/manage/new", label: t("nav.newEvent"), icon: CalendarPlus },
      ],
    });
  }
  if (viewer.role === "admin") {
    groups.push({
      label: t("nav.admin"),
      items: [{ href: "/admin/users", label: t("nav.users"), icon: ShieldCheck }],
    });
  }
  groups.push({
    label: t("nav.account"),
    items: [
      { href: "/settings/profile", label: t("nav.profile"), icon: UserRound },
      { href: "/settings/account", label: t("nav.account"), icon: Settings },
    ],
  });
  return groups;
}

/** The per-event console shown while inside /manage/<slug>. */
export function manageNav(slug: string, t: Translator): NavGroup[] {
  const base = `/manage/${slug}`;
  return [
    {
      label: t("nav.event"),
      items: [
        { href: base, label: t("nav.overview"), icon: BarChart3, exact: true },
        { href: `${base}/settings`, label: t("nav.detailsDates"), icon: Settings },
        ...(EVENT_REWARDS_ENABLED
          ? [{ href: `${base}/tracks`, label: t("nav.tracksPrizes"), icon: Trophy }]
          : []),
        { href: `${base}/announcements`, label: t("nav.announcements"), icon: Megaphone },
        { href: `${base}/workspace`, label: t("nav.auditResources"), icon: FileSearch },
        { href: `${base}/schedule`, label: t("nav.calendar"), icon: CalendarDays },
      ],
    },
    {
      label: t("nav.participate"),
      items: [
        { href: `${base}/participants`, label: t("nav.participantsProjects"), icon: Users },
        { href: `${base}/submissions`, label: t("nav.projects"), icon: FolderKanban },
      ],
    },
    {
      label: t("nav.projectEvaluation"),
      items: [
        { href: `${base}/rubric`, label: t("nav.criteria"), icon: ListChecks },
        { href: `${base}/judges`, label: t("nav.coaches"), icon: Gavel },
        { href: `${base}/results`, label: t("nav.results"), icon: Trophy },
      ],
    },
    {
      label: t("nav.operations"),
      items: [
        { href: `${base}/certificates`, label: t("nav.certificates"), icon: Award },
        { href: `${base}/data`, label: t("nav.importExport"), icon: Database },
        { href: `${base}/audit`, label: t("nav.auditLog"), icon: ScrollText },
      ],
    },
  ];
}

/** Restricted event navigation for an appointed judge who is not an event manager. */
export function judgePanelNav(slug: string, t: Translator): NavGroup[] {
  return [
    {
      label: t("nav.projectEvaluation"),
      items: [{ href: `/manage/${slug}/judges`, label: t("nav.coaches"), icon: Gavel }],
    },
  ];
}

export function extraCommands(t: Translator): NavItem[] {
  return [{ href: "/certificates", label: t("nav.certificates"), icon: ClipboardCheck }];
}
