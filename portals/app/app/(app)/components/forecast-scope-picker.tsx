"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@vxture/design-ui";

import { useMessages } from "../lib/i18n/provider";

// Which slice the trajectory and its scorecard are about.
//
// The owner's ruling of 2026-09-01 allowed territory and owner snapshots. The
// domain had supported all three since batch 1; this is the control that was
// missing, and it governs the SNAPSHOT and the SCORECARD together - taking a
// snapshot of one thing while scoring another is not a state worth being able
// to reach.
//
// IT WRITES TO THE URL, like the period tabs beside it, and for the same
// reason: "look at the east territory's Q4" has to survive being pasted into a
// message. It also keeps the query on the server rather than filtering a
// payload the client already holds.
//
// ONE PARAM, not three. `?scope=territory:terr_east` cannot disagree with
// itself; a scopeType param sitting beside stale territory and owner params
// can, and the reader would have no way to tell which won.

export interface ForecastScopePickerProps {
  readonly value: string;
  readonly territories: readonly { readonly id: string; readonly name: string }[];
  /**
   * The people who own deals in this period, derived from the pipeline itself.
   *
   * NOT A DIRECTORY, because this product has none. Offering every member would
   * mean offering owners with nothing to forecast, and a snapshot of an empty
   * scope is a row of zeroes that reads like a bad quarter rather than like an
   * empty question.
   */
  readonly owners: readonly string[];
}

export function ForecastScopePicker({
  value,
  territories,
  owners,
}: ForecastScopePickerProps) {
  const { PIPELINE_TEXT } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const select = (next: string) => {
    const q = new URLSearchParams(params.toString());
    // WORKSPACE CLEARS THE PARAM rather than writing the default into it. A URL
    // that says nothing about scope and one that says "workspace" mean the same
    // thing, and only one of them is worth sending to somebody.
    if (next === "workspace") q.delete("scope");
    else q.set("scope", next);
    startTransition(() => router.push(`?${q.toString()}`, { scroll: false }));
  };

  return (
    /* NativeSelect, the same control the target form uses for the same three
       scopes. A second shape for one concept would make them look like
       different questions. */
    <NativeSelect
      aria-label={PIPELINE_TEXT.scopeLabel}
      value={value}
      disabled={pending}
      onChange={(e) => select(e.target.value)}
    >
      <option value="workspace">{PIPELINE_TEXT.scopeWorkspace}</option>
      {territories.map((t) => (
        <option key={t.id} value={`territory:${t.id}`}>
          {PIPELINE_TEXT.scopeTerritory(t.name)}
        </option>
      ))}
      {owners.map((o) => (
        <option key={o} value={`owner:${o}`}>
          {PIPELINE_TEXT.scopeOwner(o)}
        </option>
      ))}
    </NativeSelect>
  );
}
