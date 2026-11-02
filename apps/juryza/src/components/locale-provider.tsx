"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_LOCALE,
  dictionaries,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setCurrentLocale] = useState(initialLocale);

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === locale) return;
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) return;
      setCurrentLocale(nextLocale);
      router.refresh();
    },
    [locale, router]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key) => dictionaries[locale][key] }),
    [locale, setLocale]
  );

  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useI18n() {
  const context = use(LocaleContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  return context;
}

