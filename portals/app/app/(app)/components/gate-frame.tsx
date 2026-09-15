"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ShellBrand, ShellLocaleSwitcher } from "@vxture/design-system";
import { LOCALE_CONFIGS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { writeLocale } from "../lib/i18n/write-locale";

// The frame the three gate screens share.
//
// WHICH THREE: the front door (no session), the workspace with no subscription,
// and the confirmation after signing out. None of them renders the shell -
// there is nothing to navigate - so each used to be a bare box on an empty
// page, and together they read as three unrelated products.
//
// WHAT IT IS: brand lockup, a language control, a centred well, and the same
// ambient ground behind all of them. Nothing here restyles a DS element; it
// places them and takes every colour from a token.
//
// WHY THE LANGUAGE CONTROL IS HERE AND NOT ONLY IN THE SHELL. The switcher
// lives in the shell's preference panel, and the shell is exactly what these
// three screens do not have - so an English reader who landed on the Chinese
// front door had no way to change it, on the one page where the product is
// still introducing itself. One DS element, wired to the same cookie the shell
// writes.

/** How wide the well is. The front door carries the product's claim and needs
 *  room; a refusal or a confirmation is one short column. */
export type GateWidth = "narrow" | "wide";

// Explicit pixel maxima, NOT max-w-lg / max-w-2xl: the DS registers its own
// scale on those names, where `max-w-xl` resolves to 32px. A width tier that
// silently means a tenth of what it reads as is the trap this repo has already
// walked into once.
const WIDTHS: Record<GateWidth, string> = {
  narrow: "max-w-[452px]",
  wide: "max-w-[960px]",
};

export function GateFrame({
  ariaLabel,
  width = "narrow",
  tag,
  children,
}: {
  readonly ariaLabel: string;
  readonly width?: GateWidth;
  /** The second half of the brand lockup, when the screen wants to say what
   *  the product is rather than only name it. */
  readonly tag?: ReactNode;
  readonly children: ReactNode;
}) {
  const { SHELL_TEXT, HEADER_TEXT } = useMessages();
  const locale = useLocale();
  const router = useRouter();

  return (
    <div className="bg-background text-foreground relative flex min-h-screen flex-col overflow-hidden">
      <Ambience />

      <header className="relative flex items-center justify-between gap-md px-lg py-md">
        <ShellBrand href="/" label={SHELL_TEXT.brandName} tag={tag} />
        <ShellLocaleSwitcher
          currentLocale={locale}
          // The catalogue is the platform's, not the design package's - its own
          // note says so. Same mapping the shell's preference panel uses.
          options={SUPPORTED_LOCALES.map((l) => ({
            locale: l,
            label: LOCALE_CONFIGS[l].nativeName,
            nativeName: LOCALE_CONFIGS[l].nativeName,
            flag: LOCALE_CONFIGS[l].flag,
          }))}
          buttonLabel={HEADER_TEXT.prefLocale}
          panelLabel={HEADER_TEXT.prefLocale}
          onLocaleChange={(next) => {
            // Cookie first, then ask the server again: the language is resolved
            // server-side, so re-rendering from what the client holds would
            // leave half the page behind.
            writeLocale(next as Locale);
            router.refresh();
          }}
        />
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
 * The drifting field behind the gate screens.
 *
 * STOPGAP - registered as TD-005. The design system has no ambient background
 * element, and its auth stylesheet was retired rather than replaced, so there
 * is nothing to compose here. Recovery is to delete this and consume the DS
 * element once one exists.
 *
 * It moved out of sign-in.tsx on 2026-09-15 so the three gate screens share ONE
 * copy rather than growing three: the stopgap is registered once and the TD
 * entry keeps naming a single location.
 *
 * What keeps it inside the rules: it takes every colour from a DS token and
 * defines none - the brand gradient pair the tokens already publish
 * (--color-gradient-brand-from / -to) plus --color-background for the wash. No
 * palette from any mockup is reproduced here, so the field follows the brand
 * and both themes instead of pinning one set of hex values into the product.
 * Decoration only: aria-hidden, no pointer events, nothing carries meaning.
 */
function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* ONE light source, from above the top edge.
          An earlier pass used a top-to-bottom brand wash plus a radial white
          scrim over the middle, which draws exactly what it sounds like: a
          white oval on a blue field, with its own visible edge. A single glow
          leaves the lower two thirds as the canvas colour and has no seam.
          --primary / --background rather than --color-*: those are the names
          the brand entry actually defines on :root, checked in the browser -
          an undefined custom property makes the whole gradient invalid and the
          browser drops it silently. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_78%_at_50%_-12%,color-mix(in_srgb,var(--primary)_17%,transparent),transparent_62%)]" />

      <svg
        // STATIC, deliberately. Drifting these lines needs a @keyframes this
        // repo would have to define itself - a motion value invented in a
        // product repo, and the DS ships one keyframe and no motion tokens.
        // Recorded in TD-005 with the element rather than smuggled in.
        //
        // Held to the lower half so they never run under the reading: the
        // fix for lines crossing text is to put them where the text is not,
        // not to paint a scrim over them.
        className="text-primary absolute inset-x-0 bottom-0 h-[58%] w-full opacity-[0.14]"
        viewBox="0 0 1600 560"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
      >
        <path d="M-80 250 C220 -10,360 350,650 130 S1080 -140,1680 40" />
        <path d="M-100 320 C220 60,390 410,690 180 S1130 -80,1700 100" opacity={0.7} />
        <path d="M-120 390 C230 130,420 460,720 235 S1180 -20,1710 160" opacity={0.45} />
        <path d="M-60 460 C240 220,390 540,610 360 S1070 100,1640 270" opacity={0.3} />
      </svg>

      {/* The lines fade out where they would reach the well. */}
      <div className="absolute inset-x-0 bottom-[38%] h-[24%] bg-gradient-to-b from-[var(--background)] to-transparent" />
    </div>
  );
}
