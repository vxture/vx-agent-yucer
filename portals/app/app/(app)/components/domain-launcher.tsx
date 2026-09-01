"use client";

import Link from "next/link";
import {
  Popover,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vxture/design-ui";
import {
  ShellIconButton,
  ShellPanelContent,
  ShellPanelRow,
  ShellPanelSection,
} from "@vxture/design-system";
import {
  activeDomainKey,
  primaryHref,
  resolveCrosscutting,
  resolveFunctionalDomains,
  type ResolvedDomain,
  type ResolvedModule,
} from "../lib/functional-domains";
import type { ResolvedNavEntry } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

// The functional-domain launcher - the app grid in the header.
//
// It is the ONLY way into the eight domain pages. The left flank is the board
// (how things stand), the right is the deck (what the copilot wants decided);
// neither is a menu. Before this existed the domain routes were reachable only
// by typing the URL, which is why the nine-dot button being inert was a
// functional gap and not a missing decoration.
//
// NOT ShellLauncher, and the DS is the reason rather than a preference.
// ShellLauncher takes a FLAT item list and calls back with a key - it models
// "pick one of N places", which is the right shape for a suite switcher and the
// wrong one here: this panel's whole content is the two-level structure, five
// domains each holding their modules, and flattening it to 22 rows would delete
// the grouping that makes the names mean anything. The DS ships the parts for
// exactly this case and says so - ShellPanel.tsx's header calls itself a set
// of loose parts and tells products to assemble their own panels from them,
// with the business vocabulary passed in. So: DS parts, product structure, no
// local styling beyond layout.
//
// LINKS, NOT A CALLBACK. ShellLauncher's onSelect(key) means router.push, and
// a router push is not a link: no middle-click, no open-in-new-tab, no status
// bar showing where it goes, nothing for a crawler or a screen reader to
// announce as a destination. ShellPanelRow takes href + linkComponent, so
// these are real anchors rendered by next/link.

export interface DomainLauncherProps {
  /**
   * The member's resolved navigation. Passed in rather than resolved here:
   * resolveNavigation needs the entitlement and the permission holder, both of
   * which live on the server session, and this is a client component.
   */
  readonly nav: readonly ResolvedNavEntry[];
  /** The nav key of the route on screen, so its row and domain read as active. */
  readonly activeKey: string;
  /**
   * Where a locked row goes. navigation.ts states the rule this satisfies:
   * an entitlement gap is shown "with an upgrade path, because a feature
   * nobody can see is a feature nobody buys". A locked row that were merely
   * greyed out would advertise the feature and then refuse to sell it.
   */
  readonly upgradeHref: string;
}

/**
 * ONE TEMPLATE, USED TWICE. The crosscutting row and the domain columns are
 * two grids, so the only thing making 今日判断 exactly as wide as the block
 * under it is that both grids declare the same tracks. Naming it once is what
 * keeps that true - two copies of a column list is two chances to change one.
 *
 * FIVE ACROSS ONCE THERE IS ROOM FOR FIVE. The panel's width is capped by the
 * window, so on a narrow one the box shrinks while a fixed column count would
 * not: measured at an 800px window, five columns left 120px each and every
 * module name became an ellipsis. Viewport breakpoints are honest HERE, unlike
 * inside the fixed-width panes of the body - this element is portaled to the
 * document and its width really does follow the window.
 */
const COLUMNS = "grid grid-cols-2 gap-x-lg md:grid-cols-3 xl:grid-cols-5";

/**
 * The dashed rule between domain columns.
 *
 * WRITTEN OUT, NOT COMPUTED. Tailwind reads SOURCE TEXT, so building this from
 * SHELL_PANEL_HAIRLINE at runtime - `xl:${hairline.replace("border-t",
 * "border-l")}` - produces class names that exist in the DOM and have no CSS
 * behind them. The first version of this line did exactly that and appeared to
 * work, because `border-dashed` and `border-primary/10` happen to be emitted
 * for other files. That is luck, not correctness, and the luck runs out the
 * day nothing else uses them.
 *
 * The colour and the dash still belong to the DS: domain-launcher.test.ts
 * asserts this string against SHELL_PANEL_HAIRLINE, so the two cannot drift
 * without CI saying so.
 *
 * ONLY AT xl, WHERE THE FIVE REALLY ARE ONE ROW. The rule is applied by INDEX,
 * and an index only maps to a column while nothing wraps. Measured at a 900px
 * window: the columns fall to three, index 3 lands at x=0 of the second row,
 * and it drew a dashed line down the panel's own left padding - a rule against
 * the edge rather than between two things. Below xl the columns are separated
 * by whitespace, which is what a wrapped layout can honestly say.
 */
export const COLUMN_RULE =
  "xl:border-l xl:border-dashed xl:border-primary/10 xl:dark:border-primary/20 xl:pl-md xl:pr-md";

export function DomainLauncher({
  nav,
  activeKey,
  upgradeHref,
}: DomainLauncherProps) {
  const {
    DOMAIN_LABEL,
    DOMAIN_GROUP_LABEL,
    DOMAIN_GROUP_QUESTION,
    PLANNED_MODULE_LABEL,
    LAUNCHER_TEXT,
    TIER_LABEL,
  } = useMessages();

  const domains = resolveFunctionalDomains(nav);
  const crosscutting = resolveCrosscutting(nav);
  const here = activeDomainKey(activeKey);

  const row = (m: ResolvedModule) =>
    m.kind === "planned" ? (
      // disabled is the DS's third row state and its documented meaning is
      // exactly this one: "the feature is here, it just is not available".
      // A row that is absent instead would answer "does this product do
      // quoting" with "no" rather than "yes, not yet".
      <ShellPanelRow
        key={`planned-${m.key}`}
        icon={m.icon}
        label={PLANNED_MODULE_LABEL[m.key] ?? m.key}
        value={LAUNCHER_TEXT.planned}
        disabled
      />
    ) : m.kind === "section" ? (
      // A LIVE LINK, not a greyed row. It is built; it simply shares a page.
      <ShellPanelRow
        key={`section-${m.key}`}
        icon={m.icon}
        label={PLANNED_MODULE_LABEL[m.key] ?? m.key}
        value={LAUNCHER_TEXT.section}
        href={m.href}
        linkComponent={Link}
        chevron={false}
      />
    ) : m.state === "locked" ? (
      // NOT disabled, unlike a planned row, and the difference is the whole
      // point of the two states. Planned means nobody can have it yet, so
      // there is nothing to click. Locked means this workspace has not bought
      // it - which is a thing they can act on, and the row is where they act.
      //
      // AND IT NAMES THE TIER. "需升级" says you cannot have it without saying
      // what would change that, which is an upsell nobody can act on. The
      // required tier has always been derivable (`minTierFor`); until now
      // nothing carried it to a surface. The external-link glyph stays -
      // trailingIcon, not chevron, because the destination is the platform
      // console and not a route in this app.
      <ShellPanelRow
        key={m.key}
        icon={m.icon}
        label={DOMAIN_LABEL[m.key] ?? m.key}
        value={
          m.requiredTier
            ? LAUNCHER_TEXT.locked(TIER_LABEL[m.requiredTier] ?? m.requiredTier)
            : LAUNCHER_TEXT.lockedNoTier
        }
        href={upgradeHref}
        newTab
        trailingIcon="external-link"
      />
    ) : (
      // NO CHEVRON. `chevron` defaults to true whenever a row has an href, and
      // that default is right for a panel of a few rows where the glyph says
      // "this one goes somewhere". Here EVERY row goes somewhere - twenty-two
      // of them, in five columns - so the glyph distinguishes nothing and only
      // takes the width the module names need. Turned off through the DS prop
      // rather than hidden with CSS.
      <ShellPanelRow
        key={m.key}
        icon={m.icon}
        label={DOMAIN_LABEL[m.key] ?? m.key}
        href={m.href}
        linkComponent={Link}
        active={m.key === activeKey}
        chevron={false}
      />
    );

  /**
   * The domain heading: a ShellPanelRow, flat, with the question under it.
   *
   * NO IDENTITY BLOCK. A previous pass used ShellPanelHeader, whose mark is a
   * `size-media-sm` Avatar - which gives the icon a PERMANENT BACKGROUND, and
   * a background in this panel is meant to say hover or current, not "this is
   * an icon". The row's Button variant already owns that: ghost until you
   * point at it, secondary when it is where you are.
   *
   * It also fixes an alignment this file could not honestly fix. The Avatar
   * centred a 32px glyph in a 48px block, so the domain icon sat 8px inside
   * its own inset while a module icon started flush - two icon columns 7px
   * apart, measured, with no spacing token in between (the scale steps by 4).
   * Closing it needed a magic offset fighting a DS component's internals.
   * Removing the block removes the problem: both levels are the same row on
   * the same ROW_INSET, so the icons are one column by construction.
   *
   * THE COLOUR DIFFERENCE IS THE DS's. ROW_ICON_TONE is
   * `text-muted-foreground` and the label is foreground - icon and title
   * already differ, and nothing here restates a colour. What separates this
   * row from the five under it is the description line, the gap below it, and
   * the dashed rule between columns.
   *
   * WHERE IT GOES IS MEASURED, not uniform - see primaryHref. A domain holding
   * two or more routes gets a home page, because no single page is that
   * domain; a domain holding one route IS that page. Not a link at all when
   * every built module was refused on permission and only planned rows keep
   * the column alive: a heading that navigates nowhere is worse than one that
   * does not offer to.
   */
  const domainHeading = (d: ResolvedDomain) => {
    const href = primaryHref(d);
    const question = DOMAIN_GROUP_QUESTION[d.key] ?? "";
    return (
      <ShellPanelRow
        icon={d.icon}
        label={DOMAIN_GROUP_LABEL[d.key] ?? d.key}
        description={
          /* A TOOLTIP, BECAUSE THE LINE IS CLIPPED. The row's description is
             `truncate`, which is right - a wrapped question would make five
             columns different heights - but a clipped sentence with no way to
             read the rest is text the product has taken away. Measured at
             1700px none of the five actually clip; at the widths a real window
             has, they do.

             The DS's own Tooltip; the provider is mounted at the app layout,
             and a DS Tooltip throws outside one. */
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block w-full truncate">{question}</span>
            </TooltipTrigger>
            <TooltipContent>{question}</TooltipContent>
          </Tooltip>
        }
        {...(href ? { href, linkComponent: Link } : {})}
        active={d.key === here}
        chevron={false}
        /* THE WHOLE HEADING IS THE BRAND COLOUR - mark AND name, not just the
           mark. The DS row's own pairing is a muted icon beside a foreground
           label, which is the right contrast for a row among rows and exactly
           the problem here: the heading wore the same two colours as the five
           rows beneath it, so the only thing separating the levels was the
           description line. A first pass tinted the icon alone and left the
           name at foreground - the same near-black as every module under it -
           so at a glance the levels still read the same.

           `text-primary` carries the label by inheritance; the child selector
           is needed only because ROW_ICON_TONE sets the icon's colour
           explicitly and would otherwise win.

           COLOUR TOKENS, NOT COLOURS. `text-primary` is the DS's; the DS has
           no "heading row" variant to ask for, and the row exposes className
           for exactly the cases it did not anticipate. Still no background -
           that belongs to hover and active. */
        className="text-primary [&_svg]:text-primary"
      />
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ShellIconButton
          icon="app-grid"
          /* 24px through the token, not a literal: size-icon-lg IS 24.
             ShellIconButton hardcodes Icon size="sm" (16px) and merges
             iconClassName after it, so the later size-* utility is the one
             that survives tailwind-merge. */
          iconClassName="size-icon-lg"
          label={LAUNCHER_TEXT.buttonLabel}
        />
      </PopoverTrigger>

      {/* WIDER THAN THE DEFAULT, on the DS's own instruction. ShellPanelContent
          is w-80 (320px) because most shell panels are one column of rows; the
          tokens file writes the rule for the other case beside
          --container-overlay-xl, where it caps a wide overlay and says that
          anything wider should split into columns or stop being an overlay.
          Five domains stacked in 320px is roughly 1200px of popover, which is
          not a map, it is a scroll. So: columns, and the width comes from the
          DS container scale (4xl = 56rem) rather than an invented number. 4xl and
          not 3xl because English module names run half again as long as the
          Chinese - three columns of 48rem truncated every one of them.

          Only the width and the layout of the columns are set here. Padding,
          gaps, hairlines, row metrics and the no-autofocus behaviour all stay
          the DS's. */}
      <ShellPanelContent
        align="start"
        aria-label={LAUNCHER_TEXT.panelLabel}
        className="w-(--vx-container-7xl) max-w-(--radix-popover-content-available-width)"
      >
        {/* TWO GRIDS, ONE COLUMN TEMPLATE. 今日判断 is the first row and is one
            column wide - the same width as the blocks beneath it, because the
            two grids are declared with the same template and therefore resolve
            to the same track sizes. It is not a sixth column: it belongs to no
            domain and sits above them, which is what a first row says and what
            a column beside them did not.

            It was a full-width section before that: one row stretched across
            the whole panel with its label at the far left and nothing else on
            the line. The width carried no content - the section simply had no
            neighbours. */}
        <div className="flex flex-col gap-lg">
          {crosscutting.length > 0 ? (
            <div className={COLUMNS}>
              <ShellPanelSection divided={false}>
                {crosscutting.map(row)}
              </ShellPanelSection>
            </div>
          ) : null}

          <div className={COLUMNS}>
            {domains.map((d, i) => (
              <div
                key={d.key}
                className={i === 0 ? "xl:pr-md" : COLUMN_RULE}
              >
                {domainHeading(d)}
{/* AIR BETWEEN THE TWO LEVELS. The heading and the rows are the
                    same component now, so the gap is the only thing saying
                    "these five belong under that one" - at the section's own
                    spacing the domain name read as the first of six rows. */}
                <div className="mt-sm">
                  <ShellPanelSection divided={false}>
                    {d.modules.map(row)}
                  </ShellPanelSection>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ShellPanelContent>
    </Popover>
  );
}
