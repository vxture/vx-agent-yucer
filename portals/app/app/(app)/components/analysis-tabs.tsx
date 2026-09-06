"use client";

import { useState, type ReactNode } from "react";
import { Section, Tabs, TabsContent, TabsList, TabsTrigger } from "@vxture/design-ui";

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
  title,
  description,
  summary,
  tabs,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** The one number the block exists to state, always visible. */
  readonly summary?: ReactNode;
  readonly tabs: readonly AnalysisTab[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <Tabs value={active} onValueChange={setActive}>
      <Section
        id={id}
        icon="chart-bar"
        title={title}
        description={description}
        action={
          tabs.length > 1 ? (
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-md">
          {summary}
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              {t.content}
            </TabsContent>
          ))}
        </div>
      </Section>
    </Tabs>
  );
}
