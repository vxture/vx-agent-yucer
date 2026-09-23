"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useChainView } from "./decision-chain-switch";
import {
  Button,
  SegmentedControl,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type IconName,
} from "@vxture/design-ui";
import { influenceTier, placeRelations, type ChainCoverage, type ChainRecency, type ContactNode, type RelationEdge } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { DecisionChainGraph, ROLE_ORDER } from "./decision-chain-graph";
import { LinkContacts, type LinkContactsProps } from "./link-contacts";
import { Tag } from "./tag";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { CapBadge, CapFooter, LayerLabel } from "./panorama-annotations";

// 决策角色 -> 图标 (owner, 2026-09-21: 决策角色在名称后用 tag(icon+文字) 体现).
// 全部走中性色(Tag 默认 tone="neutral") - 这一行已经有一个真正带颜色语义的
// StatusBadge(可达/未触达), 角色本身是身份分类, 不是状态, 跟 tag.tsx 文件
// 自己的规则一致("中性 tag 不该被随手上色去抢一个真正状态徽章的注意力")。
const ROLE_ICON: Record<string, IconName> = {
  economic: "wallet",
  technical: "settings",
  user: "user",
  coach: "lightbulb",
  blocker: "shield-warning",
};

// 立场 -> 图标+语气 (owner, 2026-09-21: 对我方的立场态度). 这里跟角色不同,
// 立场本身就是一个"好/坏"的判断, 所以走 StatusBadge 的语气色系而不是中性 -
// 拥护者/支持者是正面, 中立不带态度, 反对者是真正的风险信号, 三档语气
// 分得开。
const STANCE_ICON: Record<string, IconName> = {
  champion: "star",
  supporter: "thumbs-up",
  neutral: "circle-dashed",
  antagonist: "thumbs-down",
};
const STANCE_TONE: Record<string, "success" | "info" | "neutral" | "danger"> = {
  champion: "success",
  supporter: "info",
  neutral: "neutral",
  antagonist: "danger",
};

// 影响力分档 -> 语气 (owner, 2026-09-21: 实际影响力权重 - 核心圈/关键圈/
// 边缘圈). 颜色照 owner 原话的红/蓝/绿走(高=danger 红, 中=info 蓝, 低=
// success 绿) - 这里红不是"坏事", 是"最抢眼的一档", 跟这三档在其它地方的
// 语气含义(危险/信息/成功)脱钩, 只借用色板本身。
const TIER_TONE: Record<string, "danger" | "info" | "success"> = {
  high: "danger",
  medium: "info",
  low: "success",
};

// 决策链详情视图 (owner, 2026-09-20: 设计图严格对齐 - 先做，别再等我确认;
// 2026-09-21 重点完善 - 组织内角色分类、立场、影响力权重、人际关系四个维度).
//
// account-detail 专用, 不跟 decision-chain.tsx 共用: 那个组件还被 pipeline
// 详情页复用, 这里的表格/图谱切换、角色行、返回按钮是 mockup 给"点开一条
// 决策链摘要"这个交互专门画的一套, 硬塞进共用组件会把 pipeline 页也一起
// 改样子。
//
// 表格化, 不要信息堆积 (owner, 2026-09-21) - 之前每个人是一张纵向堆叠的卡片
// (姓名+角色徽标+职务+可达状态叠着放), 塞进第四个维度(立场)会让堆叠继续
// 往下长。真正的表格让四个维度各自成一列, 眼睛横着扫一行就能比较完一个人,
// 竖着扫一列就能比较完所有人的同一个维度 - 这正是"不要堆积"要解决的问题。
//
// 关系只画"我是主语"的那条边, 不重复画 (owner: 人际及利益博弈关系) - 一条
// "刘敏 汇报给 王磊"的边, 只在刘敏那一行出现一次, 不在王磊的行上再画一遍
// "刘敏 汇报给 ta" - 同一个事实两行都写就是这张表正要避免的堆积。
// 对称的边(平级/同盟/对立)存了两个方向也只画一次; 主语不在表里时画在宾语
// 那一行, 用反向措辞 - 见 health.ts placeRelations (YC-021 L2)。

export interface DecisionChainDetailProps {
  readonly title: string;
  readonly coverage: ChainCoverage;
  readonly people: readonly ContactNode[];
  readonly contacts: readonly { id: string; name: string; title: string | null }[];
  /** 人际及利益博弈关系 - incr/0018 起就有的账户级关系边, 之前只在
   *  link-contacts.tsx 里写, 从没在决策链自己的视图里读出来过 (owner,
   *  2026-09-21: 人际及利益博弈关系). 跟 recency/coverage 一样是 page.tsx
   *  已经读过的同一份数据, 不是新读一次。 */
  readonly relations: readonly RelationEdge[];
  /** The deal page, where this chain's buying roles are edited (incr/0027:
   *  a role is a fact about one purchase). The account view only reads. */
  readonly editHref?: string;
  /** Null when the recency read failed - the table still renders, just
   *  without the per-row "上次联系" tooltip. */
  readonly recency: ChainRecency | null;
  /** Only the first chain on the page carries this - see account/[id]/page.tsx.
   *  A props bag, not a ready element (owner, 2026-09-21: 把"记录一次关系"
   *  提成弹出面板, 入口按钮放到决策链标题行) - this component now owns the
   *  trigger button AND the open/close state, so it has to be able to
   *  construct <LinkContacts> itself instead of just placing a JSX node
   *  someone else already built. Same shape as AccountHeaderMenuProps's
   *  tier/basics/owner bags. */
  readonly linkForm?: Omit<LinkContactsProps, "open" | "onOpenChange">;
}

/** 纯内容组件, 没有"返回"按钮 - 那个按钮要改 Context 里的 activeId, 所以
 *  归 decision-chain-switch.tsx 的 ChainDetailSlot 管，这里只管这条链自己
 *  的展示。 */
export function DecisionChainDetail({
  title,
  coverage,
  people,
  contacts,
  relations,
  recency,
  linkForm,
  editHref,
}: DecisionChainDetailProps) {
  const {
    ACCOUNT_TEXT,
    CHAIN_TEXT,
    RECENCY_TEXT,
    RELATION_TEXT,
    RELATION_TYPE_LABEL,
    RELATION_TYPE_LABEL_REVERSED,
    DECISION_ROLE_LABEL,
    DECISION_ROLE_ABBR,
    STANCE_LABEL,
    INFLUENCE_TIER_LABEL,
    PANEL_MENU_TEXT,
    COLLAPSE_TEXT,
  } = useMessages();
  const [view, setView] = useState<"table" | "graph">("table");
  const [linkOpen, setLinkOpen] = useState(false);
  const { relationSeq } = useChainView();
  // 入口按钮只在真的能用时出现 (owner: 决策链标题行最右) - 跟
  // contact-roster.tsx 的 "+新增" 同一惯例: 不能用就不露出触发点, 而不是
  // 露出触发点再在弹层里说"你不能用"。
  const canOpenLinkForm = linkForm != null && linkForm.canLink && linkForm.contacts.length >= 2;

  // 记录一次关系 moved from the title row into this panel's "⋮" (owner,
  // 2026-09-23), and the summary panel's 编辑 can ask for it too.
  useEffect(() => {
    if (relationSeq > 0 && canOpenLinkForm) setLinkOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationSeq]);
  const detailMenu = {
    view: { hint: PANEL_MENU_TEXT.useViewSwitch },
    edit: canOpenLinkForm ? { onSelect: () => setLinkOpen(true) } : { hint: PANEL_MENU_TEXT.noEditRight },
    extra: canOpenLinkForm ? [{ id: "relation", label: RELATION_TEXT.title, onSelect: () => setLinkOpen(true) }] : undefined,
  } as const;

  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? id;
  const titleOf = (id: string) => contacts.find((c) => c.id === id)?.title ?? null;

  // 联系证据 - 真实数据: 这个人在 warm/cold/unrecorded 哪一桶里, 不是编的
  // 叙事句子 (见文件头注释)。
  const recencyLineFor = (id: string): string | null => {
    if (!recency) return null;
    if (recency.warm.some((c) => c.id === id)) return RECENCY_TEXT.warm(recency.windowDays);
    if (recency.cold.some((c) => c.id === id)) return RECENCY_TEXT.cold(recency.windowDays);
    if (recency.unrecorded.some((c) => c.id === id)) return RECENCY_TEXT.unrecorded;
    return null;
  };

  // EVERY PERSON GETS A ROW (YC-021 L2: 四维在同一张表里可横向比较). This
  // used to be one row per ROLE - ROLE_ORDER.map(role => people.find(...)) -
  // so a second technical buyer, and everyone not yet given a role, was not
  // in the table at all and could not be compared. Ordered by role, then the
  // people still there before the ones who have left.
  const roleRank = (r: string) => {
    const i = (ROLE_ORDER as readonly string[]).indexOf(r);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  const rows = [...people].sort(
    (a, b) =>
      roleRank(a.decisionRole) - roleRank(b.decisionRole) ||
      Number(a.status !== "active") - Number(b.status !== "active"),
  );

  // Each edge ONCE (placeRelations): a symmetric edge stored both ways is one
  // fact, and an edge whose subject is not on this deal is drawn on the
  // object's row in reversed wording instead of disappearing.
  const placed = placeRelations(
    rows.map((p) => p.id),
    relations,
  );
  const relationsFor = (id: string): { label: string; toName: string }[] =>
    placed
      .filter((r) => r.rowId === id)
      .map((r) => ({
        label:
          (r.reversed ? RELATION_TYPE_LABEL_REVERSED[r.relationType] : undefined) ??
          RELATION_TYPE_LABEL[r.relationType] ??
          r.relationType,
        toName: nameOf(r.otherId),
      }));

  // 可达/未触达标记不止经济决策人有 (owner, 2026-09-20: 设计图严格对齐 -
  // 技术决策人、阻碍者也各自带一个). 内线(coach)不带 - 这个角色本来就是靠
  // "跟我们有联系"才成立的, 再标一次可达是同一件事说两遍。经济决策人继续用
  // coverage.economicBuyerUnreachable (经由内线走到他的路径是否存在, 比"这个
  // 人本身最近有没有联系"更严格的事实); 其余角色用 recency 的 warm/非warm -
  // 同一份 chainRecency 数据, 不是新算的。
  const isReachable = (p: ContactNode): boolean | null => {
    if (p.decisionRole === "coach") return null;
    if (p.decisionRole === "economic") return !coverage.economicBuyerUnreachable;
    if (!recency) return null;
    if (recency.warm.some((c) => c.id === p.id)) return true;
    if (recency.cold.some((c) => c.id === p.id) || recency.unrecorded.some((c) => c.id === p.id)) return false;
    return null;
  };

  return (
    <div className="flex flex-col gap-lg">
      <CollapsibleSection
        menu={detailMenu}
        summary={COLLAPSE_TEXT.chainDetail(coverage.covered.length, ROLE_ORDER.length, !coverage.economicBuyerUnreachable)}
        tone="raised"
        style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
        // 标题行整合 (owner, 2026-09-21: 决策链展开页面信息应该整合一下 -
        // 标题内容丰富: 决策链 · 商机名 + 两个 tag, 居右切换按钮). 之前
        // "决策链"(卡头) / 商机名(body 里单独一行加粗文字) / 覆盖率(卡头
        // action, 纯文字) / 可达状态(body 里单独一行, 跟切换按钮并排) 是
        // 四处分散的信息, `title` prop 本身早就是 CHAIN_TEXT.forDeal 拼好
        // 的"决策链 · 全国门店数字化"(page.tsx 传进来的), 却只在 body 里
        // 又写了一遍, 卡头自己还留着通用的"决策链"三个字 - 两处都在说同一
        // 件事。现在卡头的 title 就是这条完整的字符串, 两个状态各自收成一个
        // tag 跟在它后面, 不再另起一行。
        title={
          <span className="gap-xs flex flex-wrap items-center">
            <span className="whitespace-nowrap">{title}</span>
            <LayerLabel layer="L2" />
            <CapBadge tier="pro">Pro</CapBadge>
            {coverage.economicBuyerUnreachable ? (
              <StatusBadge tone="danger" dot>
                {rows.some((p) => p.decisionRole === "economic" && p.status === "active")
                  ? CHAIN_TEXT.unreachable
                  : CHAIN_TEXT.noEconomicBuyer}
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" dot>
                {CHAIN_TEXT.reachable}
              </StatusBadge>
            )}
            <Tag>{CHAIN_TEXT.coverageCount(coverage.covered.length, ROLE_ORDER.length)}</Tag>
          </span>
        }
        // 表格/图谱切换挪到卡头右侧的 action 位, 不再跟可达状态挤在 body 的
        // 同一行 - 这也是 health-panel.tsx"重新评估"按钮已经在用的位置。
        //
        // "记录一次关系"的入口挪到这一行最右, 表格/图谱左移让位 (owner,
        // 2026-09-21: 把记录一次关系这个便捷页面提成单独弹出面板, 入口按钮
        // 放到决策链标题行, 位置最右, 把列表/图形按钮左移空出位置) - 之前
        // 这张便捷表单是卡片下面一张永远占着地方的独立 Section, 不管有没有
        // 人正要用它, 跟这一session已经改过的上级/下级、联系人、销售负责人
        // 是同一个"展示和编辑混在一起"的形状, 现在改成按需弹出的 Drawer。
        action={
          <span className="gap-sm flex items-center">
            <SegmentedControl
              items={[
                { value: "table", label: CHAIN_TEXT.viewTable },
                { value: "graph", label: CHAIN_TEXT.viewGraph },
              ]}
              value={view}
              onChange={setView}
            />
            {/* 编辑入口跳回具体商机 (YC-021 L2): roles are written on the deal. */}
            {editHref ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={editHref}>{CHAIN_TEXT.editOnDeal}</Link>
              </Button>
            ) : null}
          </span>
        }
      >
        <div className="flex flex-col gap-md">
          {/* 覆盖缺口 NAMED (YC-021 L2): "3/5" says a gap exists, not which
              one - and which one is the whole question for whoever has to go
              find that person. */}
          {coverage.missing.length > 0 ? (
            <div className="gap-xs flex flex-wrap items-center">
              <span className="text-muted-foreground text-body-sm">{CHAIN_TEXT.missing}</span>
              {coverage.missing.map((role) => (
                <StatusBadge key={role} tone="warning">
                  {DECISION_ROLE_LABEL[role] ?? role}
                </StatusBadge>
              ))}
            </div>
          ) : null}
          {view === "table" ? (
            <div className="-mx-2xs overflow-x-auto px-2xs [&_td]:px-xs [&_th]:px-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{CHAIN_TEXT.colPerson}</TableHead>
                  <TableHead>{CHAIN_TEXT.colRole}</TableHead>
                  {/* 立场 and 影响力 share a column (polish, 2026-09-24): six
                      columns did not fit the ~580px centre - 关系 was cut and
                      可达 fell off the card. Both stay visible, stacked. */}
                  <TableHead>{CHAIN_TEXT.colStanceInfluence}</TableHead>
                  <TableHead>{CHAIN_TEXT.colRelationship}</TableHead>
                  <TableHead>{CHAIN_TEXT.colReachable}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const detail = recencyLineFor(p.id);
                  const reachable = isReachable(p);
                  const tier = influenceTier(p.influence);
                  const theirRelations = relationsFor(p.id);
                  return (
                    <TableRow key={p.id}>
                      {/* 徽标表示人，不是角色 (owner, 2026-09-21) - 跟 sidebar
                          联系人卡片(contact-roster.tsx 的 ContactCard)同一个
                          "姓氏圆圈"惯例, 不是角色首字。 */}
                      {/* min width + no wrap (polish, 2026-09-24): in the ~580px
                          centre the auto layout squeezed this column until a name
                          and its title stacked one character per line, and the
                          可达 column fell off the card. */}
                      <TableCell className="min-w-[9rem]">
                        <div className="gap-sm flex items-center">
                          <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
                            {nameOf(p.id).charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <div className="gap-xs flex items-center">
                              <span className="text-body-sm font-bold whitespace-nowrap">{nameOf(p.id)}</span>
                              {/* 关键人异动: someone who left stays visible - the
                                  reachability verdict above has already stopped
                                  counting them, and the row says why. */}
                              {p.status !== "active" ? (
                                <Tag>{ACCOUNT_TEXT.contactStatusLabel[p.status] ?? p.status}</Tag>
                              ) : null}
                            </div>
                            {titleOf(p.id) ? (
                              <div className="text-muted-foreground text-body-sm whitespace-nowrap">{titleOf(p.id)}</div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* The role's name only; the EB/TB/UB code moved to the
                            hover title - "EB · 经济决策人" was the widest tag in a
                            table that had run out of width. */}
                        <span
                          className="inline-flex whitespace-nowrap"
                          title={DECISION_ROLE_ABBR[p.decisionRole] ?? undefined}
                        >
                          <Tag icon={ROLE_ICON[p.decisionRole]}>
                            {DECISION_ROLE_LABEL[p.decisionRole] ?? p.decisionRole}
                          </Tag>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2xs">
                          {p.stance ? (
                            <Tag tone={STANCE_TONE[p.stance]} icon={STANCE_ICON[p.stance]}>
                              {STANCE_LABEL[p.stance] ?? p.stance}
                            </Tag>
                          ) : (
                            <span className="text-muted-foreground text-body-sm">—</span>
                          )}
                          {tier ? (
                            <Tag tone={TIER_TONE[tier]}>
                              {INFLUENCE_TIER_LABEL[tier]} · {p.influence}
                            </Tag>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {theirRelations.length > 0 ? (
                          <div className="flex flex-col gap-2xs">
                            {theirRelations.map((r, i) => (
                              <span key={i} className="text-body-sm whitespace-nowrap">
                                {r.label} {r.toName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-body-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {reachable != null ? (
                          detail ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <StatusBadge tone={reachable ? "success" : "danger"}>
                                    {reachable ? CHAIN_TEXT.reachFlagYes : CHAIN_TEXT.reachFlagNo}
                                  </StatusBadge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{detail}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <StatusBadge tone={reachable ? "success" : "danger"}>
                              {reachable ? CHAIN_TEXT.reachFlagYes : CHAIN_TEXT.reachFlagNo}
                            </StatusBadge>
                          )
                        ) : (
                          <span className="text-muted-foreground text-body-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          ) : (
            <DecisionChainGraph coverage={coverage} people={people} contacts={contacts} relations={relations} />
          )}
        </div>
        <CapFooter>
          <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capChainBasic}
          <br />
          <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capChainPro}
        </CapFooter>
      </CollapsibleSection>

      {linkForm ? (
        <LinkContacts {...linkForm} open={linkOpen} onOpenChange={setLinkOpen} />
      ) : null}
    </div>
  );
}
