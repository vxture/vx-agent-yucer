"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@vxture/design-system";
import { LOCALE_CONFIGS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import { useLocale, useMessages } from "./i18n/provider";
import { writeLocale } from "./i18n/write-locale";

/**
 * ShellHeaderTools' theme and language tools, ONE definition for both
 * headers that carry them - the product shell and the gate screens' website
 * header. They were written out twice (Sonar: 41.6% new-code duplication).
 */
export function useHeaderToolConfig() {
  const { HEADER_TEXT } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const { mode, setMode } = useTheme();
  return {
    theme: {
      current: (mode === "dark" ? "dark" : "light") as "dark" | "light",
      onChange: (next: "light" | "dark") => setMode(next),
      toDarkLabel: HEADER_TEXT.prefThemeDark,
      toLightLabel: HEADER_TEXT.prefThemeLight,
    },
    locale: {
      current: locale,
      // The catalogue is the platform's, not the design package's.
      options: SUPPORTED_LOCALES.map((l) => ({
        locale: l,
        label: LOCALE_CONFIGS[l].nativeName,
        nativeName: LOCALE_CONFIGS[l].nativeName,
        flag: LOCALE_CONFIGS[l].flag,
      })),
      // Cookie first, then ask the server again: the language is resolved
      // server-side.
      onChange: (next: string) => {
        writeLocale(next as Locale);
        router.refresh();
      },
      label: HEADER_TEXT.prefLocale,
      panelLabel: HEADER_TEXT.prefLocale,
    },
  };
}
