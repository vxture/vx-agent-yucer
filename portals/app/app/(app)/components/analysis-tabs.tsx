"use client";

import { useState, type ReactNode } from "react";
import { Section, Tabs, TabsContent, TabsList, TabsTrigger, type IconName } from "@vxture/design-ui";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection, type PanelAction } from "./collapsible-section";
import { useAccountEdit } from "./account-edit-context";

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
  /** Shown as a pill after the label (the prototype's tab bar, YC-026) rather
   *  than "(n)" in the text. */
  readonly count?: number;
  readonly content: ReactNode;
  /** L3·L4 roster (owner, 2026-09-23): this tab's 查看 / 编辑 in the card's
   *  own "⋮", which follows the tab that is open. "contract-create" asks the
   *  contract card to open its 录入合同 drawer (account-edit-context.tsx) -
   *  a string because a server page cannot hand the client a function. */
  readonly view?: PanelAction;
  readonly edit?: PanelAction | "contract-create";
}

export function AnalysisTabs({
  id,
  icon = "chart-bar",
  title,
  description,
  summary,
  tabs,
  defaultKey,
  collapsible,
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
   *  that also use this component do not, so it is opt-in - and opting in
   *  REQUIRES the folded line (the norm: never empty). */
  readonly collapsible?: { readonly summary: string };
}) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key ?? "");

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // components/org-unit-panel.tsx 同名注释).
  const accountEdit = useAccountEdit();
  const activeTab = tabs.find((t) => t.key === active);
  const menu =
    collapsible && activeTab && (activeTab.view || activeTab.edit)
      ? {
          view: activeTab.view ?? ("expand" as const),
          edit:
            activeTab.edit === "contract-create"
              ? accountEdit
                ? { onSelect: () => accountEdit.requestContractCreate() }
                : { hint: "" }
              : (activeTab.edit ?? ({ hint: "" } as PanelAction)),
        }
      : undefined;

  const triggers =
    tabs.length > 1 ? (
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="group/tab gap-2xs">
            {t.label}
            {t.count !== undefined ? (
              <span className="bg-muted text-muted-foreground group-data-[state=active]/tab:bg-primary group-data-[state=active]/tab:text-primary-foreground rounded-full px-2xs text-label-sm leading-snug tabular-nums">
                {t.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    ) : undefined;
  // THE STRIP IS THE BODY'S FIRST ROW, not the header's action slot (polish,
  // 2026-09-24). Six tabs need ~700px; beside the title, its layer labels,
  // the ⋮ and the fold toggle in a ~600px card they ran over the title and
  // pushed the ⋮ out of the card. Folded, the body goes and the strip with it.
  const body = (
    <div className="flex flex-col gap-md">
      {triggers ? <div className="overflow-x-auto">{triggers}</div> : null}
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
          summary={collapsible.summary}
          menu={menu}
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
        >
          {body}
        </Section>
      )}
    </Tabs>
  );
}
