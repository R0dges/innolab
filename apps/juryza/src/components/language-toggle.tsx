"use client";

import { ToggleGroup, ToggleGroupItem } from "@juryza/ui/components/ui/toggle-group";

import { useI18n } from "@/components/locale-provider";
import type { Locale } from "@/lib/i18n";

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[locale]}
      onValueChange={(value) => {
        const nextLocale = value[0] as Locale | undefined;
        if (nextLocale) void setLocale(nextLocale);
      }}
      aria-label={t("language.label")}
    >
      <ToggleGroupItem value="fr" aria-label={t("language.fr")}>
        FR
      </ToggleGroupItem>
      <ToggleGroupItem value="en" aria-label={t("language.en")}>
        {compact ? "EN" : "EN"}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

