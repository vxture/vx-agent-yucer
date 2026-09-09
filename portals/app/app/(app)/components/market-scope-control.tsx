"use client";

import { useState, useTransition } from "react";
import { NativeSelect, useToast } from "@vxture/design-ui";
import {
  MARKET_SCOPES,
  type MarketScope,
  type MarketScopeKind,
} from "../../domains/shared/market-division";
import { useMessages } from "../lib/i18n/provider";
import { setMarketScopeAction } from "../admin/division/actions";

/* 市场范围 - the frame the regions are carved inside (incr/0043).
 *
 * ONE CONTROL SHOWING ONE VALUE (owner, 2026-09-09: 市场范围也是一个按钮选项
 * 就行，只展示其一). The page is 区域配置; the frame is a fact about the
 * tenant that the roster sits inside, not a section of the page. So it is a
 * select in the header that reads "中国市场" at rest, and only when opened
 * shows the other two - greyed and marked 未建, because a frame this build
 * cannot carve in is a promise, not a choice. Three segments laid flat across
 * the page put the frame ahead of the regions, which is backwards.
 *
 * The rule behind the grey is setMarketScope's `scope_not_open`.
 */
export function MarketScopeControl({
  scope,
  editable,
}: {
  readonly scope: MarketScope;
  readonly editable: boolean;
}) {
  const { PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<MarketScopeKind>(scope.kind);
  const { toast } = useToast();

  const change = (next: MarketScopeKind) => {
    const before = kind;
    setKind(next);
    start(async () => {
      const r = await setMarketScopeAction({ kind: next, code: null });
      if (!r.ok) {
        setKind(before);
        toast({ tone: "danger", title: TERRITORY_ERROR[r.error] ?? r.error });
      } else {
        toast({ tone: "success", title: PLANNING_TEXT.scopeSaved });
      }
    });
  };

  return (
    <NativeSelect
      /* SIZED TO ITS VALUE, not to the header: it is one option beside a
         badge, and a select stretched across the slot read as a filter bar.
         On the WRAPPER, as the DS says: the chevron anchors to it, and a
         width on the select alone leaves the arrow stranded at the far edge. */
      wrapperClassName="w-fit"
      aria-label={PLANNING_TEXT.scopeLabelTitle}
      value={kind}
      disabled={!editable || pending}
      onChange={(e) => change(e.target.value as MarketScopeKind)}
    >
      {MARKET_SCOPES.map((s) => (
        <option key={s.kind} value={s.kind} disabled={!s.open}>
          {s.open
            ? PLANNING_TEXT.scopeLabel[s.kind]
            : `${PLANNING_TEXT.scopeLabel[s.kind]} · ${PLANNING_TEXT.scopePlanned}`}
        </option>
      ))}
    </NativeSelect>
  );
}
