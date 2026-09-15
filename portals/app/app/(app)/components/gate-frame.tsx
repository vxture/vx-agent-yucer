"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ShellBrand,
  ShellFullscreenToggle,
  ShellIconGroup,
  ShellLocaleSwitcher,
  ShellThemeToggle,
  useTheme,
} from "@vxture/design-system";
import { Button } from "@vxture/design-ui";
import { LOCALE_CONFIGS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { writeLocale } from "../lib/i18n/write-locale";
import { websiteUrl } from "../lib/website-url";

// The frame the four gate screens share.
//
// WHICH FOUR: the front door (no session), the workspace with no subscription,
// the member with no role, and the confirmation after signing out. None of
// them renders the product shell - there is nothing to navigate - so each used
// to be a bare box on an empty page, and together they read as four unrelated
// products.
//
// THE HEADER IS THE PUBLIC SITE'S (owner, 2026-09-15). Measured on
// vxture.com rather than guessed: the row is 64px tall, the container is
// centred and climbs 1280 -> 1536 -> 1600px, and the side padding ends at
// 32px. Product lockup left; the same three controls right (theme / language /
// fullscreen) and one primary action, which is what that site puts there.
//
// It was full-bleed before, which put the wordmark and the language control on
// opposite edges of a 2560px screen with nothing in between; a fixed 1280 then
// went too far the other way and looked cramped on a wide display. The ladder
// is the point - it stays generous without ever running to the bezel.
//
// These are the DS's own shell controls, not local ones - the same three
// elements the product shell's preference panel uses, and the same cookie the
// switcher writes.

/** How wide the well is. The front door needs room; a refusal is one column. */
export type GateWidth = "narrow" | "wide";

// Explicit pixel maxima, NOT max-w-lg / max-w-2xl: the DS registers its own
// scale on those names, where `max-w-xl` resolves to 32px. A width tier that
// silently means a tenth of what it reads as is the trap this repo has already
// walked into once - and the public site walks into it in the very header this
// one is copied from, where `max-w-7xl` measures 128px.
const WIDTHS: Record<GateWidth, string> = {
  narrow: "max-w-[452px]",
  wide: "max-w-[760px]",
};

/** The fullscreen toggle needs something to make fullscreen. */
const ROOT_ID = "gate-root";

export function GateFrame({
  ariaLabel,
  width = "narrow",
  children,
}: {
  readonly ariaLabel: string;
  readonly width?: GateWidth;
  readonly children: ReactNode;
}) {
  const { SHELL_TEXT, HEADER_TEXT } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const site = websiteUrl();

  return (
    <div
      id={ROOT_ID}
      className="bg-background text-foreground relative flex min-h-screen flex-col overflow-hidden"
    >
      <Ambience />

      <header className="relative">
        <div className="gap-md px-md sm:px-lg lg:px-xl mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between xl:max-w-[1536px] 2xl:max-w-[1600px]">
          <ShellBrand href="/" logoSrc="/logo.svg" label={SHELL_TEXT.brandName} />

          <div className="gap-sm flex items-center">
            <ShellIconGroup label={HEADER_TEXT.prefTitle}>
              <ShellThemeToggle
                currentTheme={mode === "dark" ? "dark" : "light"}
                buttonLabel={HEADER_TEXT.prefTheme}
                lightLabel={HEADER_TEXT.prefThemeLight}
                darkLabel={HEADER_TEXT.prefThemeDark}
                onThemeChange={(next) => setMode(next)}
              />
              <ShellLocaleSwitcher
                currentLocale={locale}
                // The catalogue is the platform's, not the design package's -
                // its own note says so. Same mapping the shell's preference
                // panel uses.
                options={SUPPORTED_LOCALES.map((l) => ({
                  locale: l,
                  label: LOCALE_CONFIGS[l].nativeName,
                  nativeName: LOCALE_CONFIGS[l].nativeName,
                  flag: LOCALE_CONFIGS[l].flag,
                }))}
                buttonLabel={HEADER_TEXT.prefLocale}
                panelLabel={HEADER_TEXT.prefLocale}
                onLocaleChange={(next) => {
                  // Cookie first, then ask the server again: the language is
                  // resolved server-side, so re-rendering from what the client
                  // holds would leave half the page behind.
                  writeLocale(next as Locale);
                  router.refresh();
                }}
              />
              <ShellFullscreenToggle
                targetId={ROOT_ID}
                enterLabel={HEADER_TEXT.fullscreen}
                exitLabel={HEADER_TEXT.fullscreenExit}
              />
            </ShellIconGroup>

            {/* Null only when a stack empties the variable on purpose: a button
                that goes nowhere is worse than no button. */}
            {site && (
              <Button asChild size="sm">
                <a href={site}>{SHELL_TEXT.website}</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-lg py-2xl">
        <section aria-label={ariaLabel} className={`w-full ${WIDTHS[width]}`}>
          {children}
        </section>
      </main>
    </div>
  );
}

/**
 * The ground behind the gate screens.
 *
 * STOPGAP - registered as TD-005. The design system has no ambient background
 * element, and its auth stylesheet was retired rather than replaced, so there
 * is nothing to compose here. Recovery is to delete this and consume the DS
 * element once one exists.
 *
 * TWO FLAT LAYERS, and no drawing (owner, 2026-09-15: the previous version's
 * hand-drawn curves had no form and were simply ugly). A glow from above the
 * top edge, and a measured grid that fades out before it reaches the reading.
 * A grid is a shape rather than a squiggle: it says the product is precise,
 * it cannot be badly drawn, and it holds up at any viewport because nothing
 * about it is a fixed path.
 *
 * Every colour is a token - `--primary` and `--background`, which are the names
 * the brand entry actually defines on :root (checked in the browser; an
 * undefined custom property makes the whole gradient invalid and the browser
 * drops it silently). No palette from any mockup is reproduced, so the ground
 * follows the brand and both themes. Decoration only: aria-hidden, no pointer
 * events, nothing here carries meaning.
 */
function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* One light source, from above the top edge. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_78%_at_50%_-12%,color-mix(in_srgb,var(--primary)_17%,transparent),transparent_62%)]" />

      {/* The grid, masked so it never runs under the text: it is at full
          strength along the bottom edge and gone by the middle of the page. */}
      <div
        className="absolute inset-0 [background-size:64px_64px] [mask-image:linear-gradient(to_top,black,transparent_58%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--primary) 9%, transparent) 1px, transparent 1px)," +
            "linear-gradient(to bottom, color-mix(in srgb, var(--primary) 9%, transparent) 1px, transparent 1px)",
        }}
      />
    </div>
  );
}
