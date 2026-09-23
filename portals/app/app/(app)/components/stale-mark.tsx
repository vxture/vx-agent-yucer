"use client";

import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { Freshness } from "../../domains/account/lib/evidence-quality";

// 陈旧提示 (L2 batch seven) - ONE mark, reused wherever a judgement is shown,
// so the health card and the judgement feed never grow two differently
// worded versions of the same warning (design T4: a shared small component).
//
// Renders nothing for fresh evidence or for a claim with no dated evidence -
// a mark that is always there is a mark nobody reads. The title says it is
// rule-computed, which is how it differs from a model's "疑似冲突" (batch 7b).

export function StaleMark({ freshness }: { readonly freshness: Freshness | null | undefined }) {
  const { EVIDENCE_TEXT } = useMessages();
  if (!freshness?.stale) return null;
  return (
    <span title={EVIDENCE_TEXT.staleHint}>
      <Tag tone="warning">{EVIDENCE_TEXT.stale(freshness.daysAgo)}</Tag>
    </span>
  );
}
