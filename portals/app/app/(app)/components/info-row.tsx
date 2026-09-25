import type { ReactNode } from "react";

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
export function InfoRow({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-md py-2xs">
      <dt className="text-muted-foreground shrink-0 text-body-sm">{label}</dt>
      <dd className="text-foreground min-w-0 flex-1 text-right text-body-sm whitespace-nowrap">{children}</dd>
    </div>
  );
}
