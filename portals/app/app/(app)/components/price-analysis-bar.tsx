"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 智能定价评估 | 定价变化分析 - moved from the price table's header into 栏3's
// business-intelligence area (owner, 2026-09-29), directly above the analysis
// they produce. A button beside a table that fills a panel somewhere else made
// the reader look in two places for one answer.
//
// WHAT IT RUNS ON. The table publishes what is ticked as `?sel=` (product
// ids); this button commits it as `?analyze=`, which the deck's server
// component reads. Nothing ticked means the whole book - the panel's own
// "全部" link already works that way, and a disabled button here would send
// the reader back across the page to find out why.
//
// 定价变化分析 is not built. Shown disabled with its reason rather than hidden:
// a capability the product intends is worth seeing, and the hover says why it
// does nothing. The data it will read is already accruing (incr/0030).

export function PriceAnalysisBar() {
  const { CATALOG_TEXT } = useMessages();
  const params = useSearchParams();
  const sel = params.get("sel") ?? "";

  const next = new URLSearchParams(params.toString());
  next.set("analyze", sel === "" ? "all" : sel);

  return (
    <div className="flex items-center gap-sm">
      <Button asChild size="sm" variant="secondary" title={CATALOG_TEXT.analyzeSelectedHint}>
        <Link href={`/pricebook?${next.toString()}`} scroll={false}>
          {CATALOG_TEXT.assessSelected}
        </Link>
      </Button>
      <Button size="sm" variant="secondary" disabled title={CATALOG_TEXT.priceTrendSoon}>
        {CATALOG_TEXT.priceTrend}
      </Button>
    </div>
  );
}
