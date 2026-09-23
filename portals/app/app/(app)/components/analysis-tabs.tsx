"use client";

import { useState, type ReactNode } from "react";
import { Section, Tabs, TabsContent, TabsList, TabsTrigger, type IconName } from "@vxture/design-ui";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";

// 分析板块的图表切换 - owner ruling, 2026-09-06 (多张图改为 tab 切换，位置放在
// 标题栏右侧).
//
// ONE COMPONENT FOR ALL THREE ANALYSIS BLOCKS, not the same markup written out
// in collections, delivery and forecast. The owner's standing preference is
// that a shared behaviour lives in a shared file (2026-09-06), and this one
// has a detail worth writing once: the Tabs ROOT has to wrap the whole
// Section, because the triggers sit in the Section's `action` slot while the
// panels render in its body, and Radix needs one root over both. Written per
// page, that structure is three chances to nest it wrong.
//
// THE HEADLINE METRIC STAYS OUT OF THE TABS. Each of these blocks opens with a
// single number - collected against promised, reported rosier than the facts,
// rule and filing agree - and that number is the reason to look at the block
// at all. Putting it behind a tab would mean a reader has to guess which tab
// the summary is under. The CHARTS are what alternate; the summary is what
// they alternate beneath.

export interface AnalysisTab {
  readonly key: string;
  readonly label: string;
  readonly content: ReactNode;
}

export function AnalysisTabs({
  id,
  icon = "chart-bar",
  title,
  description,
  summary,
  tabs,
  defaultKey,
  collapsible = false,
  collapsedSummary,
}: {
  readonly id: string;
  /** Defaults to the original "chart-bar" (owner, 2026-09-06 ruling was
   *  written for the three chart-switching blocks) - a caller whose tabs
   *  are not charts (account/[id]/page.tsx's 阵地清单 is a roster, not a
   *  graph) can pass its own. */
  readonly icon?: IconName;
  readonly title: ReactNode;
  /** Optional (owner, 2026-09-20: 去掉所有垃圾说明 - 账户详情页不传这个了,
   *  见 account/[id]/page.tsx 的调用). 其他调用方仍可以传。 */
  readonly description?: string;
  /** The one number the block exists to state, always visible. */
  readonly summary?: ReactNode;
  readonly tabs: readonly AnalysisTab[];
  /** Which tab opens first. Defaults to the first tab - a caller that knows
   *  one of its tabs is empty while another is not (owner, 2026-09-21: 梳理
   *  全景图中心区域 - 阵地清单默认展开的 tab) can steer the reader to a tab
   *  that actually has something on it instead. */
  readonly defaultKey?: string;
  /** The customer page's cards fold (owner, 2026-09-23); the analysis pages
   *  that also use this component do not, so it is opt-in. */
  readonly collapsible?: boolean;
  /** One line of what still needs attention while folded. */
  readonly collapsedSummary?: ReactNode;
}) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key ?? "");

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // components/org-unit-panel.tsx 同名注释).
  const triggers =
    tabs.length > 1 ? (
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    ) : undefined;
  const body = (
    <div className="flex flex-col gap-md">
      {summary}
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key}>
          {t.content}
        </TabsContent>
      ))}
    </div>
  );

  return (
    <Tabs value={active} onValueChange={setActive}>
      {collapsible ? (
        // The tab strip only makes sense while open: openAction hides it
        // with the body, and the fold toggle stays.
        <CollapsibleSection
          tone="raised"
          style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
          id={id}
          icon={icon}
          title={title}
          description={description}
          openAction={triggers}
          summary={collapsedSummary}
        >
          {body}
        </CollapsibleSection>
      ) : (
        <Section
          tone="raised"
          style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
          id={id}
          icon={icon}
          title={title}
          description={description}
          action={triggers}
        >
          {body}
        </Section>
      )}
    </Tabs>
  );
}
