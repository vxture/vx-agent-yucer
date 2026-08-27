"use client";

import Link from "next/link";
import { Popover, PopoverTrigger } from "@vxture/design-ui";
import {
  ShellIconButton,
  ShellPanelContent,
  ShellPanelRow,
  ShellPanelSection,
} from "@vxture/design-system";
import { Icon } from "@vxture/design-ui";
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
      // The label says which page it lands on so the jump is not a surprise.
      <ShellPanelRow
        key={`section-${m.key}`}
        icon={m.icon}
        label={PLANNED_MODULE_LABEL[m.key] ?? m.key}
        value={LAUNCHER_TEXT.section}
        href={m.href}
        linkComponent={Link}
      />
    ) : m.state === "locked" ? (
      // NOT disabled, unlike a planned row, and the difference is the whole
      // point of the two states. Planned means nobody can have it yet, so
      // there is nothing to click. Locked means this workspace has not bought
      // it - which is a thing they can act on, and the row is where they act.
      // A plain anchor in a new tab: the target is the platform console, not
      // a route in this app, so next/link would be wrong and the
      // external-link glyph says where it goes before it is clicked.
      <ShellPanelRow
        key={m.key}
        icon={m.icon}
        label={DOMAIN_LABEL[m.key] ?? m.key}
        value={LAUNCHER_TEXT.locked}
        href={upgradeHref}
        newTab
        trailingIcon="external-link"
      />
    ) : (
      <ShellPanelRow
        key={m.key}
        icon={m.icon}
        label={DOMAIN_LABEL[m.key] ?? m.key}
        href={m.href}
        linkComponent={Link}
        active={m.key === activeKey}
      />
    );

  /**
   * The domain heading, and it is a LINK when the domain has anywhere to go.
   *
   * Clicking a domain lands on its first reachable module. There is no
   * separate landing page for a domain and there should not be: its whole
   * content would be the list of modules the reader is already looking at in
   * this panel. Being inside a domain is expressed instead by its module nav
   * appearing beside the page - so arriving at a module IS arriving in the
   * domain, whether you got there by the domain name or by the module.
   *
   * Not a link when every built module was refused on permission and only
   * planned rows keep the column alive. A heading that navigates nowhere is
   * worse than a heading that does not offer to.
   */
  const domainTitle = (d: ResolvedDomain) => {
    const href = primaryHref(d);
    /* THE DOMAIN NAME OUTWEIGHS ITS OWN ROWS, which the DS default does not do
       here and is right not to. ShellPanelSectionTitle is 12px/500/muted - a
       quiet label for a single-column panel where the rows are what you came
       for. In THIS panel the sections are the content: five of them side by
       side, no rules between columns, and five words the reader has never seen
       before. At the default they measured smaller and lighter than the module
       rows underneath, so the new word looked like a caption for the familiar
       one.

       The title is a ReactNode slot precisely so a product can put its own
       structure in it; the panel's padding, gaps and row metrics are
       untouched. */
    const name = (
      <span
        className={`flex items-center gap-2xs text-sm font-semibold ${
          /* Which battlefield you are standing on. This is where the current
             domain went when the nine-dot button lost its text label - it was
             in the button's accessible name, which could only ever announce
             one of the five and only to a screen reader. */
          d.key === here ? "text-primary" : "text-foreground"
        }`}
      >
        <Icon name={d.icon} size="sm" />
        {DOMAIN_GROUP_LABEL[d.key] ?? d.key}
      </span>
    );

    return (
      <span className="flex flex-col gap-2xs">
        {href ? (
          <Link href={href} className="hover:text-primary w-fit">
            {name}
          </Link>
        ) : (
          name
        )}
        {/* The question the domain answers, not a summary of what is in it -
            the modules are listed directly underneath, and naming them again
            in prose says nothing twice. Outside the link: it explains the
            destination, it is not part of it. */}
        <span className="text-muted-foreground text-xs font-normal">
          {DOMAIN_GROUP_QUESTION[d.key] ?? ""}
        </span>
      </span>
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
        {crosscutting.length > 0 ? (
          // ONE ROW, NO SECTION TITLE. It held two entries and a heading that
          // called them crosscutting; with the copilot gone that heading would
          // be a category name over a single item - and "home" is not a
          // category, it is where you land.
          <ShellPanelSection divided={false}>
            {crosscutting.map(row)}
          </ShellPanelSection>
        ) : null}

        {/* FIVE ACROSS, ONE ROW. Two rows of three made the reader scan in a
            direction the content does not run: the five are a sequence - what
            we sell, who we aim at, how we find them, how we win, how the money
            arrives - and a wrap put "how we win" underneath "what we sell" as
            though it started something new. One row is the sales motion, left
            to right, in the order it happens.

            gap-x-xl (32px) rather than the md the panel uses elsewhere: with
            no rules between them, whitespace is the only thing telling the eye
            these are five separate things rather than one list of twenty-two.
            The columns are narrow on purpose - a module name is four
            characters and does not need room it will not use. */}
        {/* FIVE ACROSS ONCE THERE IS ROOM FOR FIVE.
            The panel's width is capped by the window, so on a narrow one the
            box shrinks while the column count would not - measured at an
            800px window, five columns left 120px each and every module name
            became an ellipsis. A row of five unreadable columns is worse than
            two rows of readable ones.

            Viewport breakpoints are honest HERE, unlike inside the fixed-width
            panes of the body: this element is portaled to the document and its
            width really does follow the window. */}
        <div className="grid grid-cols-2 gap-x-xl md:grid-cols-3 xl:grid-cols-5">
          {domains.map((d) => (
            <ShellPanelSection
              key={d.key}
              divided={false}
              title={domainTitle(d)}
            >
              {d.modules.map(row)}
            </ShellPanelSection>
          ))}
        </div>
      </ShellPanelContent>
    </Popover>
  );
}
