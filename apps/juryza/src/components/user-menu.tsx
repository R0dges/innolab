"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@juryza/ui/components/ui/dropdown-menu";
import { useTheme } from "@juryza/ui/theme/theme";

import { UserAvatar } from "@/components/user-avatar";
import type { Viewer } from "@/components/viewer";
import { useI18n } from "@/components/locale-provider";
import { signOut } from "@/lib/auth-client";

/** Account menu: profile, settings, theme, sign out. */
export function UserMenu({
  viewer,
  trigger,
  side = "bottom",
  align = "end",
}: {
  viewer: Viewer;
  trigger?: React.ReactElement;
  side?: "bottom" | "top" | "right";
  align?: "start" | "end";
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={t("account.menu")}
            />
          )
        }
      >
        {trigger ? undefined : <UserAvatar name={viewer.name} image={viewer.image} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 py-2">
            <UserAvatar name={viewer.name} image={viewer.image} />
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground truncate text-sm font-medium">{viewer.name}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">
                {viewer.email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <LayoutDashboard /> {t("nav.dashboard")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/profile" />}>
            <Settings /> {t("nav.settings")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> {t("account.theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme ?? "system"}
              onValueChange={(v) => setTheme(String(v))}
            >
              <DropdownMenuRadioItem value="light">
                <Sun /> {t("account.light")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> {t("account.dark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> {t("account.system")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut /> {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
