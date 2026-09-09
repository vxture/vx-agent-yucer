import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeTone } from "@vxture/design-ui";

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
  children,
}: {
  readonly tone?: StatusBadgeTone;
  /** The DS's dense-row degradation: a dot instead of an icon. */
  readonly dot?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <StatusBadge tone={tone} dot={dot} icon={tone === "neutral" ? false : undefined}>
      {children}
    </StatusBadge>
  );
}
