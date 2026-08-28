"use client";

import { useState, useTransition } from "react";

// The submit-and-report plumbing every upsert panel repeats.
//
// FOUND BY HAND, NOT BY THE METRIC. SonarCloud's duplication detector reports
// 1.1% across this repo and does not mention these panels at all: its blocks
// have to be ten or so consecutive lines, and here the repeated plumbing is
// interleaved with each panel's own fields. Meanwhile it flags a declaration
// table and a translation pair, neither of which is copy-paste. A metric that
// counts consecutive tokens finds tables and translations; the actual
// duplication was 55 byte-identical lines spread across three files.
//
// What repeats is not the fields - those genuinely differ - it is the answer to
// "what happens when you press save": a transition, a violation code mapped
// through a dictionary, and two mutually exclusive badges. Changing how a
// failure is surfaced meant editing three files, and the fourth panel would
// have copied it a fourth time.
//
// TAKES A THUNK, not the action itself, because the three call sites do not
// share a signature: a territory upsert takes one object, a contact takes
// (accountId, input), a milestone takes (projectId, input). Wrapping the call
// at the call site keeps each panel's own arguments where a reader can see them.

export interface SaveAction {
  /** True while the transition is in flight - disables the button. */
  readonly pending: boolean;
  /** The translated message, or null. Never a rule-layer sentence (TD-010). */
  readonly err: string | null;
  /** True after a save that succeeded and has not been superseded. */
  readonly saved: boolean;
  run: (call: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) => void;
}

/**
 * @param errors the domain's code -> sentence dictionary. The server action
 *   returns a violation CODE; the sentence lives here, which is TD-010's rule.
 */
export function useSaveAction(errors: Record<string, string>): SaveAction {
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const run: SaveAction["run"] = (call, onDone) =>
    start(() => {
      void call().then((r) => {
        // Both set on every outcome. Leaving a stale success badge beside a new
        // failure is how someone reads "saved" about a write that did not
        // happen - the pair has to move together.
        setErr(r.ok ? null : (errors[r.error ?? "denied"] ?? r.error ?? ""));
        setSaved(r.ok);
        if (r.ok) onDone?.();
      });
    });

  return { pending, err, saved, run };
}
