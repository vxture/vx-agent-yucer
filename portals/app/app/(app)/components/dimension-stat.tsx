import type { ReactNode } from "react";
import type { Tone } from "@vxture/design-ui";

// header 的三个动态维度 (owner, 2026-09-20: 严格按照设计实施 - 三维度的
// 视觉是"图形 + 两行文字"，不是一个彩色胶囊). 三块共用同一个骨架:
// 图形/环 + { 小字 label 在上、正文 value 在下 }，边界隔开每一块 - 跟
// mockup 的 `.health-mini` 一模一样的构图, 只是内容分别读 商机数量/
// 客户级别/健康评估 三份真实数据。
export function DimensionStat({
  figure,
  label,
  value,
  last,
}: {
  readonly figure: ReactNode;
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** mockup 的 `.health-mini` 只有最后一块不带右边框。 */
  readonly last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-sm ${last ? "" : "border-border pr-md border-r"}`}>
      {figure}
      <div className="min-w-0">
        <div className="text-muted-foreground text-[0.65rem] font-bold tracking-wide uppercase">{label}</div>
        <div className="text-body-sm text-foreground mt-[0.0625rem]">{value}</div>
      </div>
    </div>
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

