"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LocaleSelectPanel,
  ShellHeaderDivider,
  ShellHeaderMark,
  ShellHeaderTitle,
  ShellProductTitle,
  ShellToolbox,
  ShellToolboxButton,
  useTheme,
} from "@vxture/design-system";
import { Button, Icon, Popover, PopoverContent, PopoverTrigger, ShellHeader, useFullscreen } from "@vxture/design-ui";
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
// THE HEADER IS THE DS'S 官网 VIEW (design-system 13.4, 03 §7.1; owner
// 2026-09-26). It used to be hand-measured off vxture.com (64px, a 1280 ->
// 1600px container) and carried only the company, so the product needed a
// band of its own under it. The DS now draws the website header itself -
// centred, transparent, xl - and on a product's page adds the product title
// after the site name, so the identity band went with the hand-built bar.

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
  const fullscreen = useFullscreen();
  const fullscreenOn = fullscreen.isFullscreen && fullscreen.targetId === ROOT_ID;
  const site = websiteUrl();

  return (
    <div
      id={ROOT_ID}
      className="bg-background text-foreground relative flex min-h-screen flex-col overflow-hidden"
    >
      <Ambience />

      {/* THE DS'S 官网 HEADER (design-system 13.4, 03 §7.1; owner 2026-09-26:
          登录、订阅等非业务页面有官网类型的 header，需适配): centred, on the page,
          no working controls - no launcher, tenant, search or agent. A product
          page adds the product title after the site name, which is why the
          separate product-identity band under it is gone. */}
      <ShellHeader
        layout="centered"
        surface="transparent"
        height="xl"
        className="relative"
        leading={
          <>
            <ShellHeaderMark href="/" src={BRAND_MARK_SRC} alt={BRAND_WORDMARK} />
            <ShellHeaderTitle>{BRAND_WORDMARK}</ShellHeaderTitle>
            <ShellHeaderDivider />
            <ShellProductTitle logoSrc={PRODUCT_MARK_SRC} name={SHELL_TEXT.brandMark} type={SHELL_TEXT.brandTagline} />
          </>
        }
        trailing={
          <div className="gap-sm flex items-center">
            <ShellToolbox label={HEADER_TEXT.prefTitle}>
              <ShellToolboxButton
                icon={mode === "dark" ? "sun" : "moon"}
                label={mode === "dark" ? HEADER_TEXT.prefThemeLight : HEADER_TEXT.prefThemeDark}
                onClick={() => setMode(mode === "dark" ? "light" : "dark")}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <ShellToolboxButton icon="translate" label={HEADER_TEXT.prefLocale} />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-xs">
                  {/* The catalogue is the platform's, not the design package's -
                      same mapping the shell's preference panel uses. Cookie
                      first, then ask the server again: the language is
                      resolved server-side. */}
                  <LocaleSelectPanel
                    activeLocale={locale}
                    options={SUPPORTED_LOCALES.map((l) => ({
                      locale: l,
                      label: LOCALE_CONFIGS[l].nativeName,
                      nativeName: LOCALE_CONFIGS[l].nativeName,
                      flag: LOCALE_CONFIGS[l].flag,
                    }))}
                    onSelect={(next) => {
                      writeLocale(next as Locale);
                      router.refresh();
                    }}
                  />
                </PopoverContent>
              </Popover>
              <ShellToolboxButton
                icon="corners-out"
                label={fullscreenOn ? HEADER_TEXT.fullscreenExit : HEADER_TEXT.fullscreen}
                active={fullscreenOn}
                onClick={() => {
                  const el = document.getElementById(ROOT_ID);
                  if (el) fullscreen.toggle(ROOT_ID, el);
                }}
              />
            </ShellToolbox>
            {/* Null only when a stack empties the variable on purpose: a button
                that goes nowhere is worse than no button. */}
            {site && (
              <Button asChild size="sm">
                <a href={site}>{SHELL_TEXT.website}</a>
              </Button>
            )}
          </div>
        }
      />

      {/* THE THREE BANDS. Spacing is the token scale rather than round numbers -
          3xl is 48px, 4xl 56, 6xl 80, measured rather than assumed - and it is
          deliberately loose: the identity does not sit against the header and
          the chain does not sit on the floor (80 + 56 under it). */}
      <div className="px-lg pb-4xl relative flex flex-1 flex-col items-center">
        {/* No identity band: the 官网 header carries the product title now. */}
        <div className="pt-6xl" />

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
 * The chain, shown rather than described - and now the bottom band on all four
 * screens rather than a section of the front door (owner, 2026-09-15).
 *
 * It is the product's central claim: strategy to cash, with a parent-child
 * relation at every hop. An ordered list because the order IS the content; the
 * chevrons are decoration and are hidden from the reading order.
 *
 * Wider than the middle band on purpose, and wider than it strictly needs to
 * be. Eight stops fit one row in Chinese at 760px and wrapped in English,
 * leaving "Collection" orphaned on a line of its own. Measured in the browser
 * at 1920: the English row needs 766px, so 1040 keeps it on one line with room
 * for a longer translation before anything wraps again.
 */
function Chain({ label, stops }: { readonly label: string; readonly stops: readonly string[] }) {
  return (
    <nav aria-label={label} className="w-full max-w-[1040px]">
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
      {/* THE GROUND, restored: one light source from above the top edge. A pass
          that replaced this with a corner-to-corner gradient was a misreading -
          the two layers the owner meant were the two waves below, not the
          page's colour - and the diagonal made the whole surface lean. This is
          the version that had been on screen through every earlier round. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_78%_at_50%_-12%,color-mix(in_srgb,var(--primary)_17%,transparent),transparent_62%)]" />

      {/* ONE WAVE, AND THE FADE FOLLOWS THE CURVE.
          A single vertical gradient could not do this. It runs over the
          shape's bounding box, so it is only fully transparent at the box's
          top - which is the crest on the right. The left of the wave starts
          two thirds of the way down that box and was therefore already tinted
          where it began, leaving a visible edge along the low side.
          So the ramp is built from the shape itself: the same path drawn
          sixteen times, each copy a little lower than the last, each almost
          invisible on its own. Only one copy covers the pixel just under the
          curve; all sixteen cover a pixel far below it. Depth from the curve
          is what sets the value, so every edge fades out, high or low.
          preserveAspectRatio="none" on purpose: this is a band, not a picture,
          and it should meet both edges at every width. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[55%] w-full"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
      >
        <defs>
          {/* A WAVE ON A SLANT - one trough, one crest, rising left to right.
              The baseline climbs about 200 units across the width while one
              long wave of roughly 150 rides on it. Two segments only, and the
              join at 880 is smooth by construction: the outgoing control
              (1120 64) is the reflection of the incoming one (620 236) about
              that point, which is the whole of why there is no kink. */}
          <path
            id="gate-wave"
            d="M0 244 C 330 300, 620 236, 880 150 C 1120 64, 1240 104, 1440 46 L1440 400 L0 400 Z"
          />
        </defs>

        <g fill="var(--primary)" fillOpacity="0.016">
          {Array.from({ length: 16 }, (_, i) => (
            <use key={i} href="#gate-wave" y={i * 14} />
          ))}
        </g>
      </svg>
    </div>
  );
}
