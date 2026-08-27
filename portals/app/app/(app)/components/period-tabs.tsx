"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Tabs, TabsList, TabsTrigger } from "@vxture/design-ui";

import { useMessages } from "../lib/i18n/provider";
// The page's top-level filter: which period everything below is reported for.
//
// TABS, NOT SegmentedControl, and the reason is measurable rather than taste.
// Both are the DS's "groove plus slider" shape, but SegmentedControl fills its
// groove with surface-3 - oklch(98.5%) - and this control sits on a white card,
// so the groove rendered at about 1.5% contrast and the whole thing read as
// four loose words with one highlighted. TabsList uses bg-accent, which is an
// actually visible recess. Tabs is also the right meaning: this switches which
// DATA the page is showing, which is what a tab does; a segmented control is a
// toggle inside a toolbar.
//
// IT WRITES TO THE URL, not to component state. A forecast is a thing people
// send each other - "look at Q4" has to survive being pasted into a message,
// and a reload has to land back on the period being read. State in a component
// survives neither. It also keeps the fetching on the server: the page reads
// the param and queries for that period, rather than filtering a payload the
// client already holds.

export interface PeriodTabsProps {
  readonly value: string;
  /** Quarters, then the year. Passed in so the surface does not own the calendar. */
  readonly periods: readonly string[];
  readonly yearLabel: string;
}

export function PeriodTabs({ value, periods, yearLabel }: PeriodTabsProps) {
  const { PIPELINE_TEXT } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const select = (next: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("period", next);
    startTransition(() => router.push(`?${q.toString()}`, { scroll: false }));
  };

  return (
    <Tabs value={value} onValueChange={select}>
      <TabsList aria-label={PIPELINE_TEXT.periodLabel}>
        {[...periods, yearLabel].map((p) => (
          <TabsTrigger key={p} value={p} disabled={pending}>
            {p}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
