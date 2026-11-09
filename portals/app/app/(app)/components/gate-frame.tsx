"use client";

import type { ReactNode } from "react";
import { GateAmbience } from "./gate-ambience";
import {
  ShellHeaderDivider,
  ShellHeaderMark,
  ShellHeaderTitle,
  ShellHeaderTools,
  ShellProductTitle,
} from "@vxture/design-system";
import { Button, Icon, ShellHeader } from "@vxture/design-ui";
import { BRAND_MARK_SRC, BRAND_WORDMARK, PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { useMessages } from "../lib/i18n/provider";
import { useHeaderToolConfig } from "../lib/header-tool-config";
import { websiteUrl } from "../lib/website-url";
import { PRODUCT_TITLE_ON_LADDER, TOOLBOX_ON_LADDER } from "./header-ladder";

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
  const tools = useHeaderToolConfig();
  const site = websiteUrl();

  return (
    <div
      id={ROOT_ID}
      className="bg-background text-foreground relative flex min-h-screen flex-col overflow-hidden"
    >
      <GateAmbience />

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
            <ShellProductTitle
              className={PRODUCT_TITLE_ON_LADDER}
              logoSrc={PRODUCT_MARK_SRC}
              name={SHELL_TEXT.brandMark}
              type={SHELL_TEXT.brandTagline}
            />
          </>
        }
        trailing={
          <div className="gap-sm flex items-center">
            {/* The visitor's set of the DS's standard tools (13.6): theme,
                language, fullscreen - in the DS's order. */}
            <ShellHeaderTools
              className={TOOLBOX_ON_LADDER}
              label={HEADER_TEXT.prefTitle}
              theme={tools.theme}
              locale={tools.locale}
              fullscreen={{ enterLabel: HEADER_TEXT.fullscreen, exitLabel: HEADER_TEXT.fullscreenExit, targetId: ROOT_ID }}
            />
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
            <span className="text-label-small border-primary/15 bg-card/70 px-sm py-2xs rounded-full border">
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
