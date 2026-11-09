"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ArrowLeft, ChevronsUpDown, ExternalLink } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@juryza/ui/components/ui/sidebar";

import { LogoMark } from "@/components/brand";
import { useI18n } from "@/components/locale-provider";
import { UserAvatar } from "@/components/user-avatar";
import { UserMenu } from "@/components/user-menu";
import type { Viewer } from "@/components/viewer";
import { useEvent } from "@/lib/queries";

import { judgePanelNav, mainNav, manageNav, type NavGroup } from "./nav";

/** `/manage/<slug>/…` → slug (but not `/manage/new`). */
export function manageSlug(pathname: string): string | null {
  const m = pathname.match(/^\/manage\/([^/]+)/);
  return m?.[1] && m[1] !== "new" ? m[1] : null;
}

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function Groups({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  return groups.map((g) => (
    <SidebarGroup key={g.label}>
      <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {g.items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={isActive(pathname, item.href, item.exact)}
                tooltip={item.label}
                render={<Link href={item.href} />}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}

function EventGroups({ slug, pathname }: { slug: string; pathname: string }) {
  const { data } = useEvent(slug);
  const { t } = useI18n();
  const groups = data?.viewer?.canManage ? manageNav(slug, t) : judgePanelNav(slug, t);
  return <Groups groups={groups} pathname={pathname} />;
}

export function AppSidebar({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  const slug = manageSlug(pathname);
  const { t } = useI18n();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <LogoMark className="size-8" />
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">Innovation Lab</span>
                <span className="text-muted-foreground text-xs">{t("site.internalPlatform")}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {slug ? (
          <>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip={t("nav.allEvents")} render={<Link href="/manage" />}>
                    <ArrowLeft />
                    <span>{t("nav.allEvents")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t("nav.eventPage")}
                    render={<Link href={`/e/${slug}`} target="_blank" />}
                  >
                    <ExternalLink />
                    <span>{t("nav.eventPage")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <EventGroups slug={slug} pathname={pathname} />
          </>
        ) : (
          <Groups groups={mainNav(viewer, t)} pathname={pathname} />
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu
              viewer={viewer}
              side="right"
              align="end"
              trigger={
                <SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent">
                  <UserAvatar name={viewer.name} image={viewer.image} />
                  <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                    <span className="truncate text-sm font-medium">{viewer.name}</span>
                    <span className="text-muted-foreground truncate text-xs">{viewer.email}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
