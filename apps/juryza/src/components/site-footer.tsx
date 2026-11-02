"use client";

import Link from "next/link";

import { Logo } from "@/components/brand";
import { useI18n } from "@/components/locale-provider";

export function SiteFooter() {
  const { t } = useI18n();
  const columns = [
    {
      title: t("footer.access"),
      links: [
        { href: "/events", label: t("footer.events") },
        { href: "/dashboard", label: t("footer.dashboard") },
        { href: "/manage/new", label: t("footer.newEvent") },
      ],
    },
    {
      title: t("footer.account"),
      links: [
        { href: "/login", label: t("footer.signIn") },
        { href: "/settings", label: t("footer.settings") },
      ],
    },
  ];

  return (
    <footer className="bg-muted/30 border-t">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_repeat(2,1fr)]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            {t("footer.description")}
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{column.title}</h3>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mx-auto flex w-full max-w-7xl border-t px-4 py-5 text-xs sm:px-6">
        <span>© {new Date().getFullYear()} Innovation Lab · {t("footer.internal")}</span>
      </div>
    </footer>
  );
}

