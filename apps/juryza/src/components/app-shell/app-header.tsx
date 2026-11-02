"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@juryza/ui/components/ui/breadcrumb";
import { Separator } from "@juryza/ui/components/ui/separator";
import { SidebarTrigger } from "@juryza/ui/components/ui/sidebar";
import { ThemeToggle } from "@juryza/ui/theme/theme-toggle";

import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/locale-provider";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import type { Viewer } from "@/components/viewer";
import type { TranslationKey } from "@/lib/i18n";

import { CommandMenu } from "./command-menu";

const LABELS: Record<string, TranslationKey> = {
  dashboard: "nav.dashboard",
  projects: "nav.projects",
  judging: "nav.evaluations",
  manage: "nav.organize",
  new: "nav.newEvent",
  settings: "nav.settings",
  profile: "nav.profile",
  account: "nav.account",
  admin: "nav.admin",
  users: "nav.users",
  tracks: "nav.tracksPrizes",
  rubric: "nav.criteria",
  judges: "nav.coaches",
  assignments: "nav.assignments",
  submissions: "nav.projects",
  participants: "event.participants",
  results: "nav.results",
  announcements: "nav.announcements",
  workspace: "nav.auditResources",
  schedule: "nav.calendar",
  certificates: "nav.certificates",
  data: "nav.importExport",
  audit: "nav.auditLog",
};

// Record ids (prj_…, tm_…) are meaningless in a breadcrumb; name the page instead.
const ID_LABEL: Record<string, TranslationKey> = { projects: "nav.projects" };

const label = (seg: string, t: (key: TranslationKey) => string, parent?: string) => {
  const direct = LABELS[seg];
  if (direct) return t(direct);
  if (/^[a-z]{2,5}_[a-z0-9]{6,}$/.test(seg)) {
    const idLabel = ID_LABEL[parent ?? ""];
    return idLabel ? t(idLabel) : t("nav.overview");
  }
  return decodeURIComponent(seg).replace(/-/g, " ");
};

export function AppHeader({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const segments = pathname.split("/").filter(Boolean);
  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {segments.map((seg, i) => {
            const href = `/${segments.slice(0, i + 1).join("/")}`;
            const last = i === segments.length - 1;
            return (
              <Fragment key={href}>
                {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
                <BreadcrumbItem className={last ? "min-w-0" : "hidden sm:inline-flex"}>
                  {last ? (
                    <BreadcrumbPage className="truncate capitalize">
                      {label(seg, t, segments[i - 1])}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className="capitalize" render={<Link href={href} />}>
                      {label(seg, t, segments[i - 1])}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-2">
        <LanguageToggle compact />
        <NotificationPanel viewer={viewer} />
        <CommandMenu viewer={viewer} />
        <ThemeToggle />
      </div>
    </header>
  );
}
