"use client";

import type { PriceAdvice } from "../../domains/catalog/lib/price-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// The price book's contribution to the assistant - WHAT it says, not how a
// suggestion looks (assistant.tsx owns that since 2026-09-05). This file is
// now a mapping from advice to items, which is the whole point: adding
// intelligence to a page should be writing sentences and naming acts.
//
// 采纳 applies the number the analysis named. The rules never move a floor by
// themselves - the floor is a commercial decision (ADR-019) - so acceptance
// is a person's click on a number the analysis had to be able to justify.

export function PriceAdvicePanel({
  advice,
  scope,
  canPrice,
  onApply,
  footer,
}: {
  readonly advice: readonly PriceAdvice[];
  readonly scope: "all" | "selection";
  readonly canPrice: boolean;
  readonly onApply: (input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly footer?: React.ReactNode;
}) {
  const { CATALOG_TEXT, ASSISTANT_TEXT } = useMessages();

  const text = (a: PriceAdvice) => {
    switch (a.kind) {
      case "unpriced":
        return CATALOG_TEXT.adviceUnpriced(a.productName);
      case "floor_overridden":
        return CATALOG_TEXT.adviceOverridden(a.productName, a.signatures ?? 0);
      case "floor_outlier":
        return CATALOG_TEXT.adviceOutlier(
          a.productName,
          Math.round(((a.floorPrice ?? 0) / (a.listPrice || 1)) * 100),
          a.ratioPct ?? 0,
        );
      case "floor_equals_list":
        return CATALOG_TEXT.adviceEqual(a.productName);
    }
  };

  const items: AssistantItem[] = advice.map((a) => {
    const applicable =
      canPrice && a.kind === "floor_outlier" && a.suggestedFloor !== undefined && a.listPrice !== undefined;
    return {
      id: a.id,
      text: text(a),
      evidence: applicable
        ? CATALOG_TEXT.adviceApplyFloor((a.suggestedFloor ?? 0).toLocaleString())
        : a.kind === "unpriced"
          ? CATALOG_TEXT.adviceNoNumberWhy
          : undefined,
      tone: a.kind === "unpriced" || a.kind === "floor_overridden" ? "warn" : "info",
      act: applicable
        ? {
            label: ASSISTANT_TEXT.accept,
            done: CATALOG_TEXT.adviceApplied,
            run: () =>
              onApply({
                productId: a.productId,
                currency: a.currency ?? "CNY",
                listPrice: a.listPrice!,
                floorPrice: a.suggestedFloor!,
              }),
          }
        : undefined,
      more: [
        { id: "catalogue", label: CATALOG_TEXT.adviceOpenCatalogue, href: "/catalog" },
        { id: "history", label: CATALOG_TEXT.adviceOpenHistory, href: "/pricebook#price-history" },
      ],
    };
  });

  return (
    <AssistantSection
      section={{
        id: "price-advice",
        title: CATALOG_TEXT.adviceTitle,
        scope: scope === "selection" ? CATALOG_TEXT.adviceScopeSelection : CATALOG_TEXT.adviceScopeAll,
        items,
        empty: CATALOG_TEXT.adviceClear,
        footer,
      }}
    />
  );
}
