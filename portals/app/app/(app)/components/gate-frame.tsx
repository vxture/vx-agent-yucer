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
import { Button, Icon } from "@vxture/design-ui";
import { LOCALE_CONFIGS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import { BRAND_MARK_SRC, BRAND_WORDMARK, PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { writeLocale } from "../lib/i18n/write-locale";
import { websiteUrl } from "../lib/website-url";

// The frame the four gate screens share.
//
// WHICH FOUR: the front door (no session), the workspace with no subscription,
// the member with no role, and the confirmation after signing out. None of them
// renders the product shell - there is nothing to navigate - so each used to be
// a bare box on an empty page, and together they read as four unrelated
// products.
//
// THREE BANDS, and the outer two never move (owner, 2026-09-15). Top is the
// product's identity, bottom is the chain, and the middle is whatever this
// particular refusal has to say, centred in what is left. Switching screens
// therefore changes one band and leaves the page around it still: the identity
// does not jump between a tall screen and a short one, which is what made four
// pages feel like four products.
//
// THE HEADER IS THE COMPANY'S, NOT THE PRODUCT'S. It carries the Vxture mark
// and ruyin.work, the same three controls the public site carries (theme /
// language / fullscreen, all DS shell elements), and one primary action out to
// that site. Measured on vxture.com rather than guessed: 64px tall, container
// centred and climbing 1280 -> 1536 -> 1600px, side padding ending at 32px.
// Because the header says nothing about the product, the product identity had
// to become a band of its own - which is the top band below.

/** How wide the middle band is. The door needs room; a refusal is one column. */
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
  const { SHELL_TEXT, SIGNIN_TEXT, HEADER_TEXT } = useMessages();
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
          <ShellBrand href="/" logoSrc={BRAND_MARK_SRC} label={BRAND_WORDMARK} />

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

      {/* THE THREE BANDS. Spacing is the token scale rather than round numbers -
          3xl is 48px, 4xl 56, 6xl 80, measured rather than assumed - and it is
          deliberately loose: the identity does not sit against the header and
          the chain does not sit on the floor (80 + 56 under it). */}
      <div className="px-lg pb-4xl relative flex flex-1 flex-col items-center">
        <div className="pt-6xl pb-3xl">
          <ProductIdentity name={SHELL_TEXT.brandName} />
        </div>

        {/* THE MIDDLE, and the only band that changes.
            NOT CENTRED: the space under it is twice the space above, so the
            content sits above the optical middle (owner, 2026-09-15). Centring
            a short screen left it marooned exactly halfway down a tall one.
            Two spacers rather than a computed height, so the ratio holds at
            every viewport and the content still gets whatever it needs. */}
        <main className="flex w-full flex-1 flex-col items-center">
          <div className="flex-1" />
          <section aria-label={ariaLabel} className={`w-full ${WIDTHS[width]}`}>
            {children}
          </section>
          <div className="flex-[2]" />
        </main>

        <div className="pt-3xl pb-6xl flex w-full justify-center">
          <Chain label={SIGNIN_TEXT.chainLabel} stops={SIGNIN_TEXT.chain} />
        </div>
      </div>
    </div>
  );
}

/**
 * The product's identity, on every gate screen.
 *
 * It exists because the header stopped carrying the product (owner,
 * 2026-09-15): the header is the company's now, so a visitor who types the
 * product's domain would otherwise never be told which product they reached.
 *
 * STACKED, and the mark is what holds the height. The name is deliberately
 * smaller than the headline it replaced, and a small name on its own would have
 * left this band too short to read as a band at all.
 */
function ProductIdentity({ name }: { readonly name: string }) {
  return (
    <div className="gap-md flex items-center">
      {/* From lib/brand-assets, never a literal path: both marks are stand-ins
          for assets a designer hands over later. */}
      <img
        src={PRODUCT_MARK_SRC}
        alt=""
        aria-hidden
        className="h-14 w-auto sm:h-16"
      />
      <p className="text-title-xl sm:text-heading-2">{name}</p>
    </div>
  );
}

/**
 * The chain, shown rather than described - and now the bottom band on all four
 * screens rather than a section of the front door (owner, 2026-09-15).
 *
 * It is the product's central claim: strategy to cash, with a parent-child
 * relation at every hop. An ordered list because the order IS the content; the
 * chevrons are decoration and are hidden from the reading order.
 */
function Chain({ label, stops }: { readonly label: string; readonly stops: readonly string[] }) {
  return (
    <nav aria-label={label} className="w-full max-w-[760px]">
      <div className="gap-md flex items-center">
        <span className="border-primary/15 h-px flex-1 border-t" />
        <span className="text-overline text-muted-foreground">{label}</span>
        <span className="border-primary/15 h-px flex-1 border-t" />
      </div>

      {/* pt-xl, not pt-md: the label is the band's heading and sat almost on
          top of the row it introduces. */}
      <ol className="gap-x-xs gap-y-sm pt-xl flex flex-wrap items-center justify-center">
        {stops.map((stop, i) => (
          <li key={stop} className="gap-x-xs flex items-center">
            <span className="text-label-sm border-primary/15 bg-card/70 px-sm py-2xs rounded-full border">
              {stop}
            </span>
            {/* AFTER its own stop, not before the next one. Leading it meant a
                line that wrapped on a phone began with a dangling chevron
                pointing at nothing. */}
            {i < stops.length - 1 && (
              <Icon
                name="chevron-right"
                size={12}
                aria-hidden
                className="text-muted-foreground/50"
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
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
 * A GLOW FROM ABOVE AND A SWELL ALONG THE BOTTOM THIRD (owner, 2026-09-15).
 * It has been hand-drawn curves, which had no form, and then a grid, which the
 * owner cut. What is left is two curves filling the bottom third under a
 * vertical gradient - a shape rather than a drawing, and one that cannot be
 * badly drawn because nothing about it is a fixed path at a fixed size: the
 * band is a third of whatever the viewport is and stretches to whatever width
 * it is given.
 *
 * Every colour is a token - `--primary` and `--background`, which are the names
 * the brand entry actually defines on :root (checked in the browser; an
 * undefined custom property makes a gradient invalid and the browser drops it
 * silently). No palette from any mockup is reproduced, so the ground follows
 * the brand and both themes. Decoration only: aria-hidden, no pointer events,
 * nothing here carries meaning.
 */
function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* ONE GRADIENT ACROSS THE WHOLE PAGE, on the diagonal, and TWO STOPS.
          There were two variations before - a glow from the top and a tinted
          swell at the bottom - so the eye read tinted, then white, then tinted
          again. Three stops would have rebuilt exactly that, so this runs one
          way only: clear at the top left, deepest at the bottom right, which
          is the corner the swell already occupies. One direction, one value,
          nothing in the middle to lose. */}
      <div className="absolute inset-0 bg-[linear-gradient(155deg,transparent_0%,color-mix(in_srgb,var(--primary)_15%,transparent)_100%)]" />

      {/* The swell, and ONE fill value for both curves. Where they overlap the
          value doubles on its own, which is the whole of the depth here: two
          different opacities would be the second layer of colour this pass
          exists to remove. preserveAspectRatio="none" on purpose - this is a
          band, not a picture, and it should meet both edges at every width. */}
      <svg
        className="text-primary absolute inset-x-0 bottom-0 h-[45%] w-full"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
        fill="currentColor"
        fillOpacity="0.07"
      >
        <path d="M0 118 C 300 34, 560 210, 880 150 S 1240 42, 1440 96 L1440 400 L0 400 Z" />
        <path d="M0 232 C 260 156, 620 300, 940 244 S 1280 168, 1440 208 L1440 400 L0 400 Z" />
      </svg>
    </div>
  );
}
