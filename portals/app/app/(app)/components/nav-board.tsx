"use client";

import Link from "next/link";
import { Card, Icon } from "@vxture/design-ui";
import { BarList, Gauge, Lede } from "./board-chart";
import type { BoardMetric, BoardModuleCard, BoardSection } from "../lib/board";
import { domainOf } from "../lib/functional-domains";
import type { ResolvedNavEntry } from "../lib/navigation";
import { LEVEL_INK } from "../lib/view-model";

import { useMessages } from "../lib/i18n/provider";

// The left flank: this domain's modules, each reporting where it stands.
//
// ONE STRUCTURE, not two stacked ones. Until 2026-08-31 this pane carried a
// module list - names and icons, nothing else - and beneath it a separate set
// of board cards keyed by ROUTE, pinned or collapsed into an archive. A reader
// had to hold both to answer "what is in this domain, and how is it doing",
// and the two disagreed about what a domain even contains: the module list came
// from the launcher, the cards from whatever board.ts happened to compute. Six
// modules had a card, thirteen did not, and nothing said which was which.
//
// So the module list IS the board now. Every module in the domain is a card;
// every card carries the one figure that is a reason to open it. Reading and
// navigating stop being separate acts, which was always the argument for this
// pane - it just was not true of the half that listed modules.
//
// 今日裁决 IS FIRST, IN EVERY DOMAIN. It belongs to none of the five and is the
// standing answer to "what is waiting on me" - the question a person carries
// into whichever section they open. Putting it inside a domain would make it
// that domain's business; leaving it out of four menus would hide it from
// wherever the reader happens to be standing.
//
// Order below it is the LAUNCHER'S, read from FUNCTIONAL_DOMAINS rather than
// restated. The panel and the menu naming the same modules in different orders
// is the kind of drift nobody notices and everybody trips on.
//
// Every figure comes from that module's own service through both gates (see
// board.ts). A module a member may not read shows NO number rather than a zero:
// "0 accounts" and "you cannot see accounts" are different statements.

export interface NavBoardProps {
  readonly sections: readonly BoardSection[];
  /** One card per module key. Empty metrics means the gate refused. */
  readonly modules: Record<string, BoardModuleCard>;
  readonly activeKey: string | null;
  readonly pathname: string;
  /** The member's resolved navigation, for the domain's module list. */
  readonly nav: readonly ResolvedNavEntry[];
}

export function NavBoard({
  sections,
  modules,
  activeKey,
  pathname,
  nav,
}: NavBoardProps) {
  const { BOARD_TEXT, DOMAIN_GROUP_LABEL } = useMessages();
  const domain = domainOf(pathname, nav);
  const queue = sections.find((s) => s.key === "queue");

  return (
    <nav className="flex flex-col gap-xs" aria-label={BOARD_TEXT.boardLabel}>
      {queue ? <QueueCard section={queue} active={activeKey === null} /> : null}

      {domain ? (
        <>
          {/* The section names itself once, above its modules. Not a card: it
              labels the cards under it, and giving it one would make the domain
              look like a sixth module. */}
          <span className="text-muted-foreground flex items-center gap-2xs px-2xs pt-sm text-xs">
            <Icon name={domain.icon} size="sm" />
            {DOMAIN_GROUP_LABEL[domain.key] ?? domain.key}
          </span>

          {domain.modules.map((m) => (
            <ModuleCard
              key={m.kind === "planned" ? `planned-${m.key}` : m.key}
              module={m}
              card={modules[m.key]}
              active={m.kind !== "planned" && m.key === activeKey}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}

/**
 * What is waiting on this person, above everything else.
 *
 * It keeps the tallest shape on the pane (`min-h-32`, 128px) because it is the
 * only card that is not about a place - it is about a deadline, and it has to
 * read as different in kind from the modules beneath it rather than as the
 * first of them.
 */
function QueueCard({
  section,
  active,
}: {
  section: BoardSection;
  active: boolean;
}) {
  return (
    <Card className="min-h-32 p-md">
      {/* ONE child, deliberately. Card is `flex flex-col gap-xl` - built for
          page-level cards whose sections stand 32px apart - and with two
          children that gap fires between the title and the chart on top of the
          margin the content already carries. Wrapping in a single child makes
          the gap inapplicable rather than overriding it, so the DS element is
          untouched and the rhythm in here is ours to set. */}
      <div className="flex flex-col gap-md">
        <Link
          href={section.href}
          className={[
            "min-w-0 truncate text-xs font-semibold tracking-wide",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {section.title}
        </Link>
        <Metrics section={section} />
      </div>
    </Card>
  );
}

/**
 * One module: its name, and the figure that is the reason to open it.
 *
 * A PLANNED module keeps its row and stays dead. The list is the domain's whole
 * inventory, and dropping what is unbuilt would make the section look finished
 * and quietly shrink as the product grows the other way.
 *
 * A module whose gate refused renders its name with no figure. That is not the
 * same as a zero and must not look like one - see board.ts.
 */
function ModuleCard({
  module: m,
  card,
  active,
}: {
  module: NonNullable<ReturnType<typeof domainOf>>["modules"][number];
  card: BoardModuleCard | undefined;
  active: boolean;
}) {
  const { DOMAIN_LABEL, PLANNED_MODULE_LABEL, LAUNCHER_TEXT } = useMessages();

  if (m.kind === "planned") {
    return (
      <Card className="text-muted-foreground border-dashed p-md">
        <div className="flex items-center justify-between gap-xs">
          <span className="text-sm">{PLANNED_MODULE_LABEL[m.key] ?? m.key}</span>
          <span className="text-2xs opacity-70">{LAUNCHER_TEXT.planned}</span>
        </div>
      </Card>
    );
  }

  const metrics = card?.metrics ?? [];
  const label = DOMAIN_LABEL[m.key] ?? PLANNED_MODULE_LABEL[m.key] ?? m.key;

  return (
    <Card className={`hover:border-primary p-md ${active ? "border-primary" : ""}`}>
      <div className="flex flex-col gap-sm">
        <Link
          href={m.href}
          className={`flex items-center gap-xs text-sm ${
            active ? "text-primary font-medium" : "text-foreground"
          }`}
        >
          <Icon name={m.icon} size="sm" />
          <span className="min-w-0 truncate">{label}</span>
        </Link>
        {metrics.length > 0 ? (
          <ModuleFigures metrics={metrics} chart={card?.chart} />
        ) : null}
      </div>
    </Card>
  );
}

/**
 * A module's figures.
 *
 * ONE figure is the common case and it is drawn large with its label beside it,
 * not under it: a single number stacked over a caption in a 230px card leaves
 * most of the row empty, which is what made the old cards read as mostly
 * nothing. Two or more fall back to the shared chart shapes, which already
 * decide how a set of related numbers should be drawn (see BoardSection.chart).
 */
function ModuleFigures({
  metrics,
  chart,
}: {
  metrics: readonly BoardMetric[];
  chart?: "lede" | "bars";
}) {
  if (chart === "lede") return <Lede metrics={metrics} />;
  if (chart === "bars") return <BarList metrics={metrics} />;

  if (metrics.length === 1) {
    const m = metrics[0]!;
    return (
      <div className="flex items-baseline gap-2xs">
        <span
          className={[
            "text-heading-4 tabular-nums",
            m.tone ? LEVEL_INK[m.tone] : "text-foreground",
          ].join(" ")}
        >
          {m.value}
        </span>
        <span className="text-muted-foreground truncate text-xs">{m.label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-md gap-y-2xs">
      {metrics.map((m) => (
        <span key={m.label} className="flex items-baseline gap-2xs">
          <span
            className={[
              "text-label-md font-semibold tabular-nums",
              m.tone ? LEVEL_INK[m.tone] : "text-foreground",
            ].join(" ")}
          >
            {m.value}
          </span>
          <span className="text-muted-foreground text-xs">{m.label}</span>
        </span>
      ))}
    </div>
  );
}

/** The queue's own figures, which already have a shape decided in board.ts. */
function Metrics({ section: s }: { section: BoardSection }) {
  if (s.gauge) return <Gauge gauge={s.gauge} />;
  if (s.metrics.length === 0) return null;
  if (s.chart === "lede") return <Lede metrics={s.metrics} />;
  if (s.chart === "bars") return <BarList metrics={s.metrics} />;
  return <ModuleFigures metrics={s.metrics} />;
}
