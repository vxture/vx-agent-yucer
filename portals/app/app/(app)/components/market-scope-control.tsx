"use client";

import { useState, useTransition } from "react";
import { Section, SegmentedControl, useToast } from "@vxture/design-ui";
import {
  MARKET_SCOPES,
  type MarketScope,
  type MarketScopeKind,
} from "../../domains/shared/market-division";
import { useMessages } from "../lib/i18n/provider";
import { setMarketScopeAction } from "../admin/division/actions";

/* 市场范围 - the frame the regions below are carved inside (incr/0043).
 *
 * THE FIRST THING ON THE PAGE, above the roster, because it decides what the
 * roster is a list OF: regions made of countries, of provinces, or of one
 * province's cities. Changing it does not destroy a carve - the rows keep
 * their own frame and drop out of view - but everything grouped by region
 * follows it, so it sits where a person cannot miss having changed it.
 *
 * TWO OF THE THREE ARE 未建 and the control says so rather than hiding them:
 * a greyed segment answers "does this product do that" with "yes, not yet",
 * the same call the launcher and the admin menu make for their planned items.
 * The rule behind the grey is setMarketScope's `scope_not_open`; the control
 * is only the sentence.
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
    <Section title={PLANNING_TEXT.scopeLabelTitle} description={PLANNING_TEXT.scopeWhy}>
      <SegmentedControl<MarketScopeKind>
        ariaLabel={PLANNING_TEXT.scopeLabelTitle}
        value={kind}
        onChange={change}
        items={MARKET_SCOPES.map((s) => ({
          value: s.kind,
          label: s.open
            ? PLANNING_TEXT.scopeLabel[s.kind]
            : `${PLANNING_TEXT.scopeLabel[s.kind]} · ${PLANNING_TEXT.scopePlanned}`,
          disabled: !s.open || !editable || pending,
        }))}
      />
    </Section>
  );
}
