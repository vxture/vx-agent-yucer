import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger, type Tone } from "@vxture/design-ui";

// 三个动态维度 - GRAPHIC ONLY, label/value 挪进 tooltip (owner, 2026-09-21:
// 考虑三个板块，商机数量，客户级别，健康评估，都只提供一个图形化，文字作为
// tooltip，这个很清楚). 之前的骨架是"图形 + 两行文字"横向排开(2026-09-20 的
// 版本, 跟 mockup 的 `.health-mini` 一模一样), 但这三块后来从 header 的横排
// 挪进了侧栏卡片, 纵向堆叠时那两行文字撑出比图形本身还多的高度, 是这张卡
// "很错乱"的主要原因之一 - 三个图形(圆环/勋章/圆环)紧挨着才是真正紧凑的
// 读法, 细节留给 hover。tag.tsx 的 NameOverflowTag 已经是同一个"图形 +
// Tooltip"的组合, 这里复用同一个模式而不是发明第二种。
export function DimensionStat({
  figure,
  label,
  value,
}: {
  readonly figure: ReactNode;
  readonly label: ReactNode;
  readonly value: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex">{figure}</div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-[0.65rem] font-bold tracking-wide uppercase opacity-70">{label}</div>
        <div className="text-body-sm">{value}</div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 语气 -> Tailwind 工具类，逐字照抄 DS 自己 `toneSurfaceClasses`/
 * `toneEdgeClasses` 打印出来的字符串（`node -e "require('@vxture/design-ui')
 * .toneSurfaceClasses"` 核对过）- 不是另起一套色值。之所以在这里重复一份而
 * 不是直接 `import { toneSurfaceClasses } from "@vxture/design-ui"`：那个
 * 具名导出在 Next dev 的 RSC/SSR 打包下解析成 `undefined`（`toneIcons`/
 * `toneEdgeClasses` 同样如此），CJS `require` 直接探测却正常 - 这套 DS 的
 * 具名 tone-class 导出目前在这个应用里没有第二处真正在运行时用过，怀疑是
 * 打包边界问题而非 DS 本身的缺陷，先在本文件内联，不升级为 TD。 */
const TONE_SURFACE: Record<Tone, string> = {
  neutral: "border-border bg-accent text-muted-foreground",
  brand: "border-primary-border bg-primary-muted text-primary-text",
  info: "border-info-border bg-info-muted text-info-text",
  success: "border-success-border bg-success-muted text-success-text",
  warning: "border-warning-border bg-warning-muted text-warning-text",
  danger: "border-destructive-border bg-destructive-muted text-destructive-text",
};

/**
 * 一个不带百分比的纯装饰圆环 - mockup 的 `.deal-badge`（弱底色填充 + 描边）,
 * 用于"这里有个数字"但数字不是比例读数的场合（开放商机数）。只用 DS 的
 * tone 令牌（见 `TONE_SURFACE` 的注释），不引入 mockup 自己那套硬编码色值。
 */
export function CircleBadge({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <div
      className={`flex h-[2.875rem] w-[2.875rem] flex-none items-center justify-center rounded-full border-2 font-display text-base font-extrabold ${TONE_SURFACE[tone]}`}
    >
      {children}
    </div>
  );
}

// 徽章区第一块的加强版 (owner, 2026-09-21: 补充一些信息， 商机数 / 累计
// 合同额，分两行，浅色横线隔开，商机数大字体，合同额小字体+淡色) - 只有
// 商机这一块从纯圆形换成两行的小方块, 客户级别/健康评估两块不变(它们本身
// 只有一个数, 没有"累计XX"这种第二个数可补). 自带 Tooltip, 跟 DimensionStat
// 是姐妹组件而不是套在它里面 - DimensionStat 的 Tooltip 只放得下一组
// label/value, 这里天生有两组(商机数 count / 累计合同额 amount), 硬塞
// 进同一个 Tooltip 会打破"一个 tooltip 说一件事"的约定。
export function DealsSummaryBadge({
  count,
  countLabel,
  amountText,
  amountLabel,
  amountFullText,
}: {
  readonly count: number;
  readonly countLabel: string;
  /** formatMoneyCompact 的结果 - 徽章正文只有这么大地方, 摆不下完整数字。
   *  null 表示这批开放商机没有一个能合并成同一币种的总额(混币种或全部
   *  未定价) - 这时只显示商机数, 不硬凑一个误导性的合计。 */
  readonly amountText: string | null;
  readonly amountLabel: string;
  /** formatMoney 的完整结果 - compact 之外的精确数字放 tooltip 里。 */
  readonly amountFullText: string | null;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex h-[2.875rem] min-w-[2.875rem] flex-none flex-col items-center justify-center gap-[0.1875rem] rounded-md border-2 px-2xs ${TONE_SURFACE.brand}`}
        >
          <span className="font-display text-base leading-none font-extrabold">{count}</span>
          {amountText ? (
            <>
              <span className="border-primary-border/50 h-px w-full" />
              <span className="text-[0.6rem] leading-none opacity-70">{amountText}</span>
            </>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-[0.65rem] font-bold tracking-wide uppercase opacity-70">{countLabel}</div>
        <div className="text-body-sm">{count}</div>
        {amountFullText ? (
          <>
            <div className="text-[0.65rem] font-bold tracking-wide uppercase opacity-70 mt-2xs">{amountLabel}</div>
            <div className="text-body-sm">{amountFullText}</div>
          </>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

