"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LayoutDashboard, Menu } from "lucide-react";

import { Button } from "@juryza/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@juryza/ui/components/ui/sheet";
import { cn } from "@juryza/ui/lib/utils";
import { ThemeToggle } from "@juryza/ui/theme/theme-toggle";

import { Logo } from "@/components/brand";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/locale-provider";
import { UserMenu } from "@/components/user-menu";
import { useViewer } from "@/components/viewer";

export function SiteHeader() {
  const viewer = useViewer();
  const pathname = usePathname();
  const { t } = useI18n();
  const links = [
    { href: "/events", label: t("site.events") },
    { href: "/#parcours", label: t("site.howItWorks") },
  ];
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "text-muted-foreground hover:text-foreground rounded-md px-3 py-2 transition-colors",
                pathname.startsWith(l.href) && l.href !== "/" && "text-foreground font-medium"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle compact />
          <ThemeToggle />
          {viewer ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="hidden sm:inline-flex"
                nativeButton={false}
                render={<Link href="/dashboard" />}
              >
                <LayoutDashboard /> {t("site.openDashboard")}
              </Button>
              <UserMenu viewer={viewer} />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button
                size="sm"
                variant="ghost"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                {t("site.signIn")}
              </Button>
            </div>
          )}
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="md:hidden"
                  aria-label={t("site.menu")}
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="hover:bg-muted rounded-md px-3 py-2 text-sm"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-2">
                  {viewer ? (
                    <Button nativeButton={false} render={<Link href="/dashboard" />}>
                      {t("site.openDashboard")}
                    </Button>
                  ) : (
                    <Button nativeButton={false} render={<Link href="/login" />}>
                      {t("site.signIn")}
                    </Button>
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
