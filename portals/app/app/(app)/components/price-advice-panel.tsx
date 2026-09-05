"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ActionMenu, Button, Card, StatusBadge, useToast } from "@vxture/design-ui";
import type { PriceAdvice } from "../../domains/catalog/lib/price-advice";
import { useMessages } from "../lib/i18n/provider";

// PRICE ANALYSIS, in the dock beside the price book (owner ruling
// 2026-09-05). The conversation keeps the top of the dock; this is what
// replaced the workspace-wide queues below it - on this page they answered
// questions the page was not asking.
//
// EACH ITEM CARRIES ITS EVIDENCE AND THREE WAYS OUT: 采纳 applies the number
// the analysis names, 忽略 puts it away, and the menu holds the ways of
// looking rather than acting. The rules never move a floor by themselves -
// the floor is a commercial decision (ADR-019), so 采纳 is a person's click
// on a number the analysis had to be able to justify.
//
// 忽略 IS A VIEW DISMISSAL, said plainly rather than dressed up: it clears
// the row until the next analysis. Remembering a dismissal across sessions is
// a stored judgement (the snooze table's shape) and it is not built here.

export function PriceAdvicePanel({
  advice,
  scope,
  canPrice,
  onApply,
}: {
  readonly advice: readonly PriceAdvice[];
  /** "selection" when the table asked about specific rows, "all" otherwise -
   * the panel says which, so a short list never reads as a clean book. */
  readonly scope: "all" | "selection";
  readonly canPrice: boolean;
  readonly onApply: (input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const shown = advice.filter((a) => !ignored.includes(a.id));

  const line = (a: PriceAdvice) => {
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

  /** What 采纳 would do, in words - and null when the advice names no number,
   * in which case there is nothing to accept and the item offers the way to
   * do it by hand instead. */
  const applyLabel = (a: PriceAdvice) =>
    a.kind === "floor_outlier" && a.suggestedFloor !== undefined
      ? CATALOG_TEXT.adviceApplyFloor(a.suggestedFloor.toLocaleString())
      : null;

  const apply = (a: PriceAdvice) => {
    const { suggestedFloor, listPrice } = a;
    if (suggestedFloor === undefined || listPrice === undefined) return;
    start(() => {
      void onApply({
        productId: a.productId,
        currency: a.currency ?? "CNY",
        listPrice,
        floorPrice: suggestedFloor,
      }).then((r) => {
        if (r.ok) {
          setIgnored((x) => [...x, a.id]);
          toast({ tone: "success", title: CATALOG_TEXT.adviceApplied });
        } else {
          toast({
            tone: "danger",
            title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied,
          });
        }
      });
    });
  };

  return (
    <Card className="p-sm">
      <div className="flex items-center gap-xs">
        <span className="text-label-md text-foreground">{CATALOG_TEXT.adviceTitle}</span>
        <span className="text-muted-foreground ml-auto text-body-sm">
          {scope === "selection" ? CATALOG_TEXT.adviceScopeSelection : CATALOG_TEXT.adviceScopeAll}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground mt-sm text-body-sm">{CATALOG_TEXT.adviceClear}</p>
      ) : (
        <div className="mt-sm flex flex-col gap-sm">
          {shown.map((a) => (
            <div key={a.id} className="border-border rounded-md border p-sm">
              <p className="text-foreground text-body-sm">{line(a)}</p>
              <div className="mt-sm flex flex-wrap items-center gap-xs">
                {canPrice && applyLabel(a) ? (
                  <Button size="sm" disabled={pending} onClick={() => apply(a)}>
                    {CATALOG_TEXT.adviceAccept}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setIgnored((x) => [...x, a.id])}
                >
                  {CATALOG_TEXT.adviceIgnore}
                </Button>
                <span className="ml-auto">
                  <ActionMenu
                    items={[
                      {
                        id: "detail",
                        label: applyLabel(a) ?? CATALOG_TEXT.adviceNoNumber,
                        disabled: true,
                        hint: applyLabel(a) ?? CATALOG_TEXT.adviceNoNumberWhy,
                      },
                      {
                        id: "product",
                        label: CATALOG_TEXT.adviceOpenCatalogue,
                        separatorBefore: true,
                        onSelect: () => {
                          window.location.href = "/catalog";
                        },
                      },
                      {
                        id: "history",
                        label: CATALOG_TEXT.adviceOpenHistory,
                        onSelect: () => {
                          window.location.href = "/pricebook#price-history";
                        },
                      },
                    ]}
                  />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-sm flex items-center gap-xs">
        {/* ALWAYS AVAILABLE, and always about the whole book: the table's own
            button asks about a selection, this one asks about everything in
            force. History is never analysed - a superseded price is a record,
            not a decision to make. */}
        <Button asChild size="sm" variant="secondary">
          <Link href="/pricebook?analyze=all">{CATALOG_TEXT.adviceRunAll}</Link>
        </Button>
        {ignored.length > 0 ? (
          <StatusBadge tone="neutral">{CATALOG_TEXT.adviceIgnored(ignored.length)}</StatusBadge>
        ) : null}
      </div>
    </Card>
  );
}
