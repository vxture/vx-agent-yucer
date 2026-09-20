import type { ReactNode } from "react";
import { StatusBadge, Tooltip, TooltipContent, TooltipTrigger, type IconName, type StatusBadgeTone } from "@vxture/design-ui";
import type { AccountTier } from "../../domains/account/store";

// 标签 - a badge that may be neutral, which is every badge in this product
// except the ones that are always coloured.
//
// THE ONE RULE IT CARRIES: neutral shows no icon. `toneIcons.neutral` is
// "minus", and unlike the tick, the exclamation, the cross and the info mark,
// a dash means nothing - it is a mark standing in for a mark. The DS's own
// argument for its three-part composition (icon + tone + text) is that the
// icon is 表意; where it is not, the composition is two parts and a smudge.
// Owner, 2026-09-09: 前面这个 "-" 很不好看.
//
// WHY IT TAKES A TONE at all, rather than being a neutral-only chip: the dash
// arrives at two kinds of site and they look different in source. Fifty were
// literally `tone="neutral"`. Twenty more compute it - `tone={ratio >= 1 ?
// "success" : "neutral"}` - and those draw the dash on every row that is not
// the good one, which is most of the column. A rule about the neutral TONE has
// to live where the tone is decided, so it lives here.
//
// `icon={undefined}` is exactly "no opinion": the DS resolves
// `icon ?? toneIcons[tone]`, so a coloured tag keeps the icon that means
// something. Nothing here restyles the DS - it sets one documented prop by one
// stated rule.
//
// WHAT STAYS A StatusBadge: a badge that can never be neutral. The guard in
// lib/tag.test.ts is what keeps the two apart as the code grows.

export function Tag({
  tone = "neutral",
  dot,
  icon,
  children,
}: {
  readonly tone?: StatusBadgeTone;
  /** The DS's dense-row degradation: a dot instead of an icon. */
  readonly dot?: boolean;
  /** An explicit opinion, same as a coloured tag's tone-default icon is one -
   *  overrides the neutral-suppresses-icon rule above, for the rare neutral
   *  tag whose icon actually means something (a headcount, not a dash). */
  readonly icon?: IconName;
  readonly children: ReactNode;
}) {
  return (
    <StatusBadge tone={tone} dot={dot} icon={icon ?? (tone === "neutral" ? false : undefined)}>
      {children}
    </StatusBadge>
  );
}

/** 圈数字 (owner, 2026-09-11: 第一个关联区域名称后面圈数字显示总数量，如果
 *  超过1个显示数字) - first used next to the FIRST territory's name, shown
 *  only once there is more than one; also a 成员数 column's 直属人数 (owner,
 *  2026-09-13: 圆圈{直属人数}), on both org-panel.tsx's and
 *  member-org-view.tsx's own trees. NOT `./count-badge.tsx`: that element is
 *  deliberately alert-red for a notification corner mark (TD-006, 太大/颜色
 *  没有警示效果) - a plain count is information, not a warning, so reusing
 *  its colour would misapply the exact distinction that component's own
 *  comment draws. Same TD-006 shape (a circle at one digit, growing to a
 *  pill past two) on neutral DS tokens instead. */
export function CountCircle({ count }: { readonly count: number }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex h-[1rem] min-w-[1rem] items-center justify-center rounded-full px-[0.1875rem] text-[0.625rem] font-semibold leading-none tabular-nums">
      {count}
    </span>
  );
}

/** 辅助信息，靠右显示 (owner, 2026-09-16: 组织/角色互相展示对方的名称列表，
 *  多个用一行、超出裁剪) - the SAME "first name + count circle + tooltip"
 *  composition org-panel.tsx's own 区域 column already established for
 *  territories, reused here rather than inventing a second way to show "one
 *  of several, with the rest one hover away". `empty` renders muted when the
 *  list is empty (a member holding no role, or placed in no unit) - a fact
 *  worth seeing, not a blank cell. */
export function NameOverflowTag({
  names,
  empty,
}: {
  readonly names: readonly string[];
  readonly empty: ReactNode;
}) {
  if (names.length === 0) return <span className="text-muted-foreground text-body-sm">{empty}</span>;
  if (names.length === 1) return <Tag>{names[0]}</Tag>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="gap-2xs inline-flex items-center">
          <Tag>{names[0]}</Tag>
          <CountCircle count={names.length} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{names.join(" / ")}</TooltipContent>
    </Tooltip>
  );
}

/** 客户级别的金/银/铜牌图 (owner, 2026-09-20: 我在项目根目录放了三个icon，
 *  对应各户级别的图片) - a photographic medal, not the DS's generic flat
 *  "medal" glyph, so this bypasses Tag and drives StatusBadge directly with
 *  `icon={false}`: Tag's own icon prop is typed to IconName only (an opinion
 *  worth keeping there, since every other tag on this product IS a DS icon),
 *  and passing an <img> as `icon` would have meant widening that contract for
 *  one caller. Assets normalized to 128x128 transparent PNG under
 *  public/assets/icons/tier-*.png - see icons.test.ts. */
const TIER_ICON_SRC: Record<AccountTier, string> = {
  strategic: "/assets/icons/tier-gold.png",
  key: "/assets/icons/tier-silver.png",
  standard: "/assets/icons/tier-bronze.png",
};

export function TierBadge({
  tier,
  tone,
  children,
}: {
  readonly tier: AccountTier;
  readonly tone: StatusBadgeTone;
  readonly children: ReactNode;
}) {
  return (
    <StatusBadge tone={tone} icon={false}>
      <span className="gap-2xs inline-flex items-center">
        <img src={TIER_ICON_SRC[tier]} alt="" className="h-[14px] w-[14px]" />
        {children}
      </span>
    </StatusBadge>
  );
}
