"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@vxture/design-ui";
import { PIPELINE_TEXT } from "../lib/messages";

// The page's top-level filter: which period everything below is reported for.
//
// IT WRITES TO THE URL, not to component state. A forecast is a thing people
// send each other - "look at Q4" has to survive being pasted into a message, and
// a reload has to land back on the period that was being read. State in a
// component survives neither.
//
// That also keeps the fetching on the server: the page reads the param and
// queries for that period, so switching periods asks the database for the right
// snapshots rather than filtering a payload the client was already given. The
// difference matters as soon as a period has data the current one does not.
//
// useTransition so the control stays responsive while the server renders, and
// so the outgoing period is visibly pending rather than frozen.

export interface PeriodTabsProps {
  readonly value: string;
  /** Quarters, then the year. Passed in so the surface does not own the calendar. */
  readonly periods: readonly string[];
  readonly yearLabel: string;
}

export function PeriodTabs({ value, periods, yearLabel }: PeriodTabsProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const select = (next: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("period", next);
    startTransition(() => router.push(`?${q.toString()}`, { scroll: false }));
  };

  return (
    <SegmentedControl
      ariaLabel={PIPELINE_TEXT.periodLabel}
      value={value}
      onChange={select}
      size="sm"
      items={[...periods, yearLabel].map((p) => ({ value: p, label: p, disabled: pending }))}
    />
  );
}
