"use client";

import { CheckCircle2 } from "lucide-react";

import { Logo } from "@/components/brand";
import { EventCover } from "@/components/event-bits";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/locale-provider";

/** Split-screen layout for sign-in, sign-up and password reset. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const points = [t("auth.point1"), t("auth.point2"), t("auth.point3")];
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <LanguageToggle compact />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <EventCover hue={275} className="hidden text-white lg:flex">
        <div className="relative flex flex-1 flex-col justify-end gap-6 p-12">
          <ul className="flex max-w-md flex-col gap-3 text-sm text-white/85">
            {points.map((p) => (
              <li key={p} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {p}
              </li>
            ))}
          </ul>
        </div>
      </EventCover>
    </div>
  );
}
