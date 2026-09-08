"use client";

import { useState, useTransition } from "react";
import { EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { moveProvince } from "../territory/actions";

/* 大区 - 省级：两级销售区域设置.
 *
 * WHY THIS SITS UNDER 销售区域 and not somewhere new: a 大区 is ground, and
 * this module is the one that decides who covers which ground. The territory
 * roster above says which regions a person carries; this says which provinces
 * a region is made of. Read one after the other they answer "who covers 江苏"
 * without anybody having to know the mapping by heart.
 *
 * A PROVINCE BELONGS TO AT MOST ONE 大区 - the table's primary key enforces it
 * - so moving is a REPLACEMENT and the control is a single choice rather than
 * a set of checkboxes. Choosing 未归入 takes it out of every 大区, which is a
 * real state a workspace can want while it is re-carving.
 */

export interface DivisionRow {
  readonly code: string;
  readonly name: string;
  readonly provinces: readonly string[];
}

export function DivisionPanel(
  { divisions, unassigned, editable }:
  {
    readonly divisions: readonly DivisionRow[];
    /** Provinces in no 大区 at all - the statistic this panel closes on. */
    readonly unassigned: readonly string[];
    readonly editable: boolean;
  },
) {
  const { PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (province: string, code: string) => {
    setError(null);
    startTransition(async () => {
      const r = await moveProvince({ province, divisionCode: code === "" ? null : code });
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? TERRITORY_ERROR.denied ?? r.error);
    });
  };

  if (divisions.length === 0) {
    return (
      <Section title={PLANNING_TEXT.divisionTitle}>
        <EmptyState
          title={PLANNING_TEXT.divisionEmptyTitle}
          description={PLANNING_TEXT.divisionEmptyWhy}
        />
      </Section>
    );
  }

  const picker = (province: string, current: string) =>
    editable ? (
      <select
        className="border-input bg-background text-body-sm h-control-sm rounded-sm border px-xs"
        aria-label={PLANNING_TEXT.moveProvince(province)}
        value={current}
        disabled={pending}
        onChange={(e) => move(province, e.target.value)}
      >
        {divisions.map((d) => (
          <option key={d.code} value={d.code}>{d.name}</option>
        ))}
        <option value="">{PLANNING_TEXT.divisionNone}</option>
      </select>
    ) : null;

  return (
    <Section title={PLANNING_TEXT.divisionTitle} description={PLANNING_TEXT.divisionWhy}>
      {error ? <p className="text-destructive text-body-sm" role="alert">{error}</p> : null}

      <div className="gap-lg grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {divisions.map((d) => (
          <div className="border-border gap-xs flex flex-col rounded-md border p-md" key={d.code}>
            <div className="gap-xs flex items-center justify-between">
              <h3 className="text-body font-semibold">{d.name}</h3>
              {/* Counted off the same array the list draws, so the badge and
                  the provinces under it cannot disagree. */}
              <StatusBadge tone={d.provinces.length === 0 ? "warning" : "neutral"}>
                {PLANNING_TEXT.provinceCount(d.provinces.length)}
              </StatusBadge>
            </div>
            {d.provinces.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{PLANNING_TEXT.divisionHoldsNothing}</p>
            ) : (
              <ul className="gap-2xs flex flex-col">
                {d.provinces.map((p) => (
                  <li className="gap-xs flex items-center justify-between" key={p}>
                    <span className="text-body-sm">{p}</span>
                    {picker(p, d.code)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* 底部统计. THE POINT OF IT IS THE GAP, not the total: a province in no
          大区 is invisible to every roll-up that groups by one, and on the
          situation screen it is drawn grey and reads as "no business here"
          rather than "nobody has filed this ground". Stated in full, by name,
          because a count alone cannot be acted on. */}
      <div className="border-border gap-xs mt-lg flex flex-col border-t pt-md">
        <p className="text-body-sm">
          {PLANNING_TEXT.divisionCoverage(
            34 - unassigned.length, 34, divisions.length,
          )}
        </p>
        {unassigned.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{PLANNING_TEXT.divisionAllPlaced}</p>
        ) : (
          <>
            <p className="text-warning text-body-sm">
              {PLANNING_TEXT.divisionUnplaced(unassigned.length)}
            </p>
            <ul className="gap-2xs md:grid-cols-3 grid grid-cols-2 xl:grid-cols-4">
              {unassigned.map((p) => (
                <li className="gap-xs flex items-center justify-between" key={p}>
                  <span className="text-body-sm">{p}</span>
                  {picker(p, "")}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  );
}
