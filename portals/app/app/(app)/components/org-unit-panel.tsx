"use client";

import type { IcpFit } from "../../domains/strategy/lib/icp";
import type { WalletRollup } from "../../domains/pipeline/lib/wallet-share";
import { WalletOrgValue } from "./wallet-share";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FOOTPRINT_KINDS, type Footprint } from "../../domains/account/lib/footprint";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  useToast,
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vxture/design-ui";
import { ConfirmDestructive } from "./confirm-destructive";
import { CollapsibleSection } from "./collapsible-section";
import { useAccountEdit } from "./account-edit-context";

// 单位信息 (owner, 2026-09-18: 客户详情页重排; 2026-09-20 三轮调整):
//
// 第一轮 - 行业/区域从 header 搬到这里 (严格按照设计实施, mockup 原话:
// "行业、位置这些是固有属性，属于栏1的档案，不是header该扛的身份信息")。
//
// 第二轮 - PURE DISPLAY ONLY (死死记住设计文件 - 之前这张卡上摆了"+关联
// 上级公司"/"+关联下级单位"两个按钮，是错的). mockup 的原话在
// scratchpad/account-detail-v2-wrapped.html 里: "上级公司: shown ONLY when
// one exists...the whole row (and its own change-button) is absent...a
// dossier card states facts, it does not carry an empty-state CTA for every
// fact that could exist" - 下级单位同一条规则。编辑上下级关系的入口在
// account-header-menu.tsx 的共享"···"菜单里，不在这张只读卡片上。
//
// 第三轮 - 整张"客户信息卡"并入这里 (owner: 把中部第一块-客户信息卡，整合
// 进sidebar-第一板块=单位信息), 随后 owner 又纠正了一版细节 (补充意见):
//   - 卡头只留 icon + title 两项 - 状态标签是"动态评估", 跟客户级别/健康
//     评估同一类, 搬去内容区(客户评估卡自己的卡头), 不留在这张纯静态事实
//     的卡上。
//   - "···"菜单(定级/计划、编辑单位信息)以及销售负责人自己的编辑按钮,
//     一起被 owner 叫停 - "你是否还没理解展示/编辑拆解的意图?" - 三个分散
//     的编辑入口合并成一个"客户总编辑", 挪到侧栏顶部的功能条(返回、收起/
//     展开、客户总编辑), 这张卡因此彻底没有任何编辑触发器, 纯展示。
//   - ACC-0001+销售负责人的纯文本事实(不带编辑按钮了)搬进卡身。
// 这几块都还是 page.tsx 建好的 ReactNode 原样传进来 - 跟 editForm/linkForm
// 一直以来的"服务端建好, 客户端只管挂载"是同一个模式, 数据和动词完全没变,
// 只是把它们在 DOM 里的落点换成了这张卡(或者侧栏顶部的功能条)。
//
// 第四轮 - "定向自动分析"判断题横幅搬走了 (owner, 2026-09-21: 判定信息应该
// 移到客户评估板块，并提供展开收起功能，收起只有一行) - 曾经短暂挂在这张
// 卡的最下方(第三轮), 但判定本身是"动态评估"的一种, 跟状态标签同一个道理,
// 真正的家在 health-panel.tsx(客户评估), 也顺手把这张已经很满的卡腾出一块
// 空间。见 health-panel.tsx 同名注释。
//
// 第五轮 - 重新规整 (owner, 2026-09-21: 现在重新规整sidebar - 基本信息页面，
// 现在很错乱，你截图看一下，重新设计). 五处具体调整:
//   1. 客户编号(ACC-0001)从 body 顶部搬进标题行, 作为标题下面小字、淡化
//      的第二行 - 不再跟负责人共享一行。
//   2. 卡片明确分三段: header(title, 含客户编号那一行) / body(徽章区 +
//      分割线 + 信息区 + 下级单位) / footer(销售负责人, 独立一段, 顶部
//      有分割线) - 销售负责人从 body 顶部搬到这里。
//   3. 徽章区(以前口语说"三个图形区域", 现在起个正式名字) 整体居中(之前
//      默认靠左), 第一块(商机)补充"累计合同额"第二行 - 见 dimension-
//      stat.tsx 的 DealsSummaryBadge。
//   4. 徽章区下面加一条分割修饰线, 隔开"徽章区"和"主要信息区"两个视觉
//      分组。
//   5. 信息区(性质/区域/类型/行业/地址/上级公司)不再用 DS 的 DetailList/
//      DetailRow - 见下面 InfoRow 自己的注释, 那是 DS 组件一个验证过的
//      真实缺口, 不是猜测。
//
// 卡片标题现在是"客户简称", 不是"单位信息"这个通用词 (owner: 把客户简称
// 直接作为卡片标题). account 表目前没有 shortName 这一列 - 早先
// account-basics-form.tsx 就把"客户简称"记在"智能采集"跳过清单里, 不是这次
// 布局调整能补的缺口 - 暂时退回显示 account.name, 真正加这一列是另一件事
// (DDL 增量), 不在这次范围内。
//
// tone="raised" (owner, 2026-09-20: 设计图是全面card化) - Section 的默认
// tone 不带边框/底色, 只靠留白分层; mockup 把客户详情页的每一块都画成实体
// 卡片, 这一页因此改用 raised。
export interface OrgUnitPanelProps {
  /** account.shortName ?? account.name - see the file-level note on why the
   *  fallback exists (no shortName column yet). */
  readonly title: string;
  /** account.accountNo (owner, 2026-09-21: 把客户编号迁移到标题行，line2，
   *  小字，很灰色，淡化) - 曾经跟销售负责人共享 body 里的第一行, 现在是
   *  卡头(标题)自己的第二行。 */
  readonly accountNo: string;
  /** 销售负责人纯文本, 或 null(没有负责人时 - footer 整段不渲染, 不留一条
   *  空横线) - PLAIN TEXT, no edit trigger (owner: 展示/编辑拆解 - 三个
   *  分散的编辑入口合并进侧栏顶部的"客户总编辑", 这张卡不再有任何编辑
   *  触发器). 渲染位置是 footer(owner, 2026-09-21: 销售负责人迁移到 card
   *  最底部, card 分三部分: header=title, body, footer=我方销售负责人)。 */
  readonly ownerRow: ReactNode;
  /** 徽章区: 开放商机(累计合同额) / 客户级别 / 健康评估 (owner, 2026-09-21:
   *  三个图形区域起个名字，叫徽章区). 内容仍由 page.tsx 建好传下来
   *  (dimension-stat.tsx 的 DealsSummaryBadge + 两个 DimensionStat) - 这个
   *  组件只负责把这一整行居中、并在下面画一条分割线。 */
  readonly badges: ReactNode;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly children: readonly { id: string; name: string }[];
  readonly industry: string | null;
  readonly region: string | null;
  /** account.customerNatureId resolved to a name - the id/vocab read already
   *  existed for the edit form's dropdown, this is the first time it is
   *  shown as a read fact (owner: 补充 - 性质). */
  readonly customerNatureName: string | null;
  /** Same story as customerNatureName, for account.customerTypeId (owner:
   *  补充 - 类型). */
  readonly customerTypeName: string | null;
  /** customer_size vocab resolved to a name - the raw headcount lives on
   *  the account row but the display is the bucket label from the vocab
   *  (e.g. "1000-5000 人"), same id->name pattern as nature/type. */
  readonly scaleName: string | null;
  /**
   * 更多资料 (YC-021 L1 工商与基础字段: 字段可读可改). The design card shows
   * five facts; these were readable ONLY inside the edit drawer, so a member
   * without account.upsert could not see them at all. Folded by default,
   * opened the same way 下级单位 is in the design.
   */
  readonly more: {
    readonly province: string | null;
    readonly creditCode: string | null;
    readonly website: string | null;
    readonly employeeCount: number | null;
  };
  /**
   * ICP 拟合度 (YC-021 L1): the best-fitting target segment and its three
   * features. Undefined = the segments could not be read (no line at all);
   * null = the workspace has no segment with a condition, which is said.
   */
  readonly icp?: IcpFit | null;
  /** 钱包份额 (§9.6) - the rollup of this customer's deals; the card shows the
   *  won share only, the 存量收入 card the split. Absent = no deals to sum. */
  readonly wallet?: WalletRollup | null;
  /** 删除空壳客户 (owner, 2026-09-23). Absent for a member who may not write. */
  readonly remove?: {
    readonly accountId: string;
    readonly onFootprint: (id: string) => Promise<{ ok: true; footprint: Footprint } | { ok: false; error: string }>;
    readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  };
}

// label 淡化变小、content 保持单行并靠右, 留足空间显示"内蒙古-呼和浩特"这类
// 较长的值 (owner, 2026-09-21: 信息区布局严重问题 label - content，被显示
// 宽度度. content要保持一行并居右侧，能够显示...标题可以淡化小一些，内容
// 空间要足够). DS 自己的 DetailRow 在这个宽度下做不到这件事 - 验证过,
// 不是猜测: DetailRow 的横排布局挂在 `sm:flex-row`(>=640px) 上, 这张卡
// 实际渲染宽度(--vx-pane-nav)从来到不了那个断点, 截图也证实了 - 之前用
// DetailList/DetailRow 时"区域"和"东部"是上下堆叠的, 不是左右各占一边;
// 即使到了 640px, 它的 dd 也带着 flex-wrap, 不支持"保持一行"。dt/dd 都是
// DetailRow 内部写死的结构, 没有 className 缝隙能覆盖这两点。这是 DS 组件
// 一个真实的缺口(CLAUDE.md: 缺失的组件是向 DS 提需求，不是本地私自建组件
// 库), 这里是权宜之计: 完全复用 DS 自己的字号/颜色令牌(text-body-sm +
// text-muted-foreground 给 label, text-body-sm + text-foreground 给
// content), 不引入新的视觉语言, 只是换一种不依赖断点的排布方式。
function InfoRow({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-md py-2xs">
      <dt className="text-muted-foreground shrink-0 text-body-sm">{label}</dt>
      <dd className="text-foreground min-w-0 flex-1 text-right text-body-sm whitespace-nowrap">{children}</dd>
    </div>
  );
}

export function OrgUnitPanel({
  title,
  accountNo,
  ownerRow,
  badges,
  parentId,
  parentName,
  children,
  industry,
  region,
  customerNatureName,
  customerTypeName,
  scaleName,
  more,
  icp,
  wallet,
  remove,
}: OrgUnitPanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    ACCOUNT_TEXT, ACCOUNT_PARENT_TEXT, PANEL_MENU_TEXT, POSITION_TEXT, COLLABORATOR_TEXT, COLLAPSE_TEXT,
    ACCOUNT_DELETE_TEXT, ACCOUNT_ERROR, ICP_TEXT, WALLET_TEXT,
  } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  // The footprint is read when the confirmation opens, not on every render of
  // the page: null while it loads (every condition "unknown"), then counts.
  const [deleting, setDeleting] = useState(false);
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const openDelete = () => {
    if (!remove) return;
    setFootprint(null);
    setDeleting(true);
    void remove.onFootprint(remove.accountId).then((r) => {
      if (r.ok) setFootprint(r.footprint);
    });
  };
  const edit = useAccountEdit();
  return (
    <CollapsibleSection
      // Folded (norm: never empty): no warning lives here, so the key facts -
      // account number, industry, region.
      summary={[accountNo, industry, region].filter(Boolean).join(COLLAPSE_TEXT.separator)}
      // This panel's own "⋮" (owner, 2026-09-23): 编辑 is 客户总编辑's
      // 基础信息 drawer, and 定级 / 协作人 sit beside it - the same three
      // drawers the breadcrumb row's menu opens (account-edit-context.tsx).
      menu={{
        view: "expand",
        edit: edit?.canWrite ? { onSelect: () => edit.open("basics") } : { hint: PANEL_MENU_TEXT.noEditRight },
        extra: edit?.canWrite
          ? [
              { id: "tier", label: POSITION_TEXT.designateMenu, onSelect: () => edit.open("tier") },
              { id: "owner", label: COLLABORATOR_TEXT.editButton, onSelect: () => edit.open("owner") },
              ...(remove ? [{ id: "delete", label: ACCOUNT_DELETE_TEXT.menu, onSelect: openDelete }] : []),
            ]
          : undefined,
      }}
      tone="raised"
      icon="buildings"
      title={
        <span className="flex flex-col">
          {/* ONE LINE (owner, 2026-09-23: 单位名称不能换行, 尽量显示, 用
              tooltip) - a long name truncates with an ellipsis and the full
              name is on hover; the L1 mark never gets pushed to a new line. */}
          <span className="flex min-w-0 items-center gap-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 truncate">{title}</span>
              </TooltipTrigger>
              <TooltipContent>{title}</TooltipContent>
            </Tooltip>
          </span>
          <span className="text-muted-foreground text-body-sm font-normal">{accountNo}</span>
        </span>
      }
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
    >
      <div className="flex flex-col gap-md">
        {badges}

        {/* 徽章区下面的分割修饰线 (owner: 主要信息区（徽章下面），应该有
            一条分割修饰线) - 跟卡片其余分割线同一个 hairline 令牌
            (border-primary/10, dark 下 /20), 不是另起一套颜色。 */}
        <div className="border-primary/10 dark:border-primary/20 border-t" />

        {/* 外放五项 (owner, 2026-09-24: 除了行业，区域，性质，类型，上级单位，五个
            外放，其他全部收紧更多) - everything else, the ICP fit included,
            is one click away under 更多资料. */}
        {industry || region || customerNatureName || customerTypeName || parentName ? (
          <div className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
            {industry ? <InfoRow label={ACCOUNT_TEXT.orgUnitIndustry}>{industry}</InfoRow> : null}
            {region ? <InfoRow label={ACCOUNT_TEXT.orgUnitRegion}>{region}</InfoRow> : null}
            {customerNatureName ? <InfoRow label={ACCOUNT_TEXT.orgUnitNature}>{customerNatureName}</InfoRow> : null}
            {customerTypeName ? <InfoRow label={ACCOUNT_TEXT.orgUnitType}>{customerTypeName}</InfoRow> : null}
            {parentName ? (
              <InfoRow label={ACCOUNT_PARENT_TEXT.label}>
                <Link href={`/account/${parentId}`} className="hover:underline">{parentName}</Link>
              </InfoRow>
            ) : null}
          </div>
        ) : null}
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-2xs text-body-sm">
            <Icon name={moreOpen ? "chevron-down" : "chevron-right"} size="xs" />
            {ACCOUNT_TEXT.orgUnitMore}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="divide-primary/10 dark:divide-primary/20 mt-2xs flex flex-col divide-y divide-dashed">
              {(
                [
                  [ACCOUNT_TEXT.orgUnitScale, scaleName],
                  [ACCOUNT_TEXT.orgUnitProvince, more.province],
                  [ACCOUNT_TEXT.orgUnitCreditCode, more.creditCode],
                  [ACCOUNT_TEXT.orgUnitWebsite, more.website],
                  [ACCOUNT_TEXT.orgUnitEmployees, more.employeeCount == null ? null : String(more.employeeCount)],
                ] as const
              ).map(([label, value]) => (
                <InfoRow key={label} label={label}>
                  {value ? (
                    <span className="block truncate" title={value}>{value}</span>
                  ) : (
                    <span className="text-muted-foreground">{ACCOUNT_TEXT.orgUnitNotFilled}</span>
                  )}
                </InfoRow>
              ))}
              {wallet && wallet.eligible > 0 ? (
                <InfoRow label={WALLET_TEXT.title}>
                  <WalletOrgValue rollup={wallet} />
                </InfoRow>
              ) : null}
              {/* ICP 拟合度: the fit and its three features, spelled out - the
                  disclosure it used to have is 更多资料 itself now. */}
              {icp === null ? (
                <InfoRow label={ICP_TEXT.label}>
                  <span className="text-muted-foreground block" title={ICP_TEXT.noSegment}>{ICP_TEXT.noSegmentShort}</span>
                </InfoRow>
              ) : icp ? (
                <>
                  <InfoRow label={ICP_TEXT.label}>
                    <span className="block truncate" title={ICP_TEXT.summary(icp.fit, icp.segmentName)}>
                      {ICP_TEXT.fitValue(icp.fit, icp.segmentName)}
                    </span>
                  </InfoRow>
                  {icp.features.map((f) => (
                    <InfoRow key={f.dimension} label={ICP_TEXT.dimensionRow(ICP_TEXT.dimension[f.dimension])}>
                      <span className="block truncate" title={ICP_TEXT.feature(f.status, f.value, f.targets)}>
                        {ICP_TEXT.feature(f.status, f.value, f.targets)}
                      </span>
                    </InfoRow>
                  ))}
                </>
              ) : null}
            </dl>
            {/* 下级单位 too - only 上级单位 of the hierarchy stays outside. */}
            {children.length > 0 ? (
              <div className="mt-sm flex flex-col gap-2xs">
                <span className="text-muted-foreground text-body-sm">
                  {ACCOUNT_TEXT.orgUnitChildren(children.length)}
                </span>
                {children.map((c) => (
                  <Link
                    key={c.id}
                    href={`/account/${c.id}`}
                    className="text-body-sm hover:underline"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* FOOTER (owner, 2026-09-21: 销售负责人迁移到 card 最底部，card 分
          三部分: header=title, body, footer=我方销售负责人) - 顶部的分割线
          让这一段读作卡片自己独立的第三部分, 不是 body 里最后一条列表项;
          Section 自己把传进来的多个顶层 children 包进同一个 flex-col
          gap-md 容器, 这里的 border-t 才是真正区分 body/footer 的视觉线,
          不需要额外的外边距。没有负责人时整段不渲染, 不留一条空横线。 */}
      {ownerRow ? (
        <div className="border-primary/10 dark:border-primary/20 border-t pt-md">
          {ownerRow}
        </div>
      ) : null}
      {remove && deleting ? (
        <ConfirmDestructive
          open={deleting}
          onOpenChange={setDeleting}
          verb={ACCOUNT_DELETE_TEXT.verb}
          titleTemplate={ACCOUNT_DELETE_TEXT.titleTemplate}
          target={title}
          consequence={ACCOUNT_DELETE_TEXT.consequence}
          preconditions={FOOTPRINT_KINDS.map((k) => ({
            label: ACCOUNT_DELETE_TEXT.condition[k],
            met: footprint !== null && footprint[k] === 0,
            unknown: footprint === null,
            note:
              footprint === null
                ? ACCOUNT_DELETE_TEXT.checking
                : footprint[k] > 0
                  ? ACCOUNT_DELETE_TEXT.present(footprint[k])
                  : undefined,
          }))}
          onConfirm={async () => {
            const r = await remove.onDelete(remove.accountId);
            if (!r.ok) {
              toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? ACCOUNT_ERROR.denied ?? "" });
              return;
            }
            toast({ tone: "success", title: ACCOUNT_DELETE_TEXT.done });
            router.push("/account");
          }}
        />
      ) : null}
    </CollapsibleSection>
  );
}
