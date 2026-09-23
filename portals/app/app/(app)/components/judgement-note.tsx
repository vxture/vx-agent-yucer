"use client";

import { useState } from "react";
import { Icon } from "@vxture/design-ui";
import { StaleMark } from "./stale-mark";
import type { Freshness } from "../../domains/account/lib/evidence-quality";

// 定向自动分析, 可展开收起 (owner, 2026-09-21: 判定信息应该移到客户评估板块，
// 并提供展开收起功能，收起只有一行). 抽成独立文件而不是留在 health-panel.tsx
// 内部, 是因为它有两个消费者: HealthPanel 自己(有 health 时), 以及 page.tsx
// 里"只读成员没有 health"的退化路径(状态标签仍要显示, 判定同理) - 两处需要
// 完全一样的展开/收起行为, 抽出来才不会长成两份互相漂移的实现。
export interface Judgement {
  readonly claim: string;
  readonly rule: string | null;
  /** L2 batch seven - shown beside the claim when its evidence is old. */
  readonly freshness?: Freshness | null;
}

export function JudgementNote({ judgement }: { readonly judgement: Judgement }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="border-primary/30 bg-primary/5 flex w-full items-start gap-sm rounded-lg border p-md text-left"
    >
      <Icon
        name={open ? "chevron-down" : "chevron-right"}
        size="sm"
        className="text-muted-foreground mt-[0.1875rem] shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-body-sm font-medium ${open ? "" : "truncate"}`}>{judgement.claim}</p>
        {judgement.freshness?.stale ? (
          <span className="mt-2xs inline-block">
            <StaleMark freshness={judgement.freshness} />
          </span>
        ) : null}
        {open && judgement.rule ? (
          <p className="text-muted-foreground mt-2xs text-body-sm">{judgement.rule}</p>
        ) : null}
      </div>
    </button>
  );
}
