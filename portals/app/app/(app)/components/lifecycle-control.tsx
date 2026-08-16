"use client";

import { useState, useTransition } from "react";
import { Button, NativeSelect, StatusBadge } from "@vxture/design-system";
import { LIFECYCLE_ERROR, LIFECYCLE_TEXT } from "../lib/messages";

// Moving a plan or a campaign through its lifecycle.
//
// The choices come from the state machine's own transition map, so the picker
// offers exactly the legal moves. A control that listed every status and let the
// machine refuse four of five would teach people the product says no for reasons
// they cannot predict - and it is the map, not the surface, that knows.
//
// A terminal record renders as a badge with no control rather than a disabled
// dropdown: there is no move to make, and a greyed-out picker invites hunting
// for the one that works.

export interface LifecycleControlProps {
  readonly id: string;
  readonly status: string;
  /** The legal next states, from the domain's transition map. */
  readonly options: readonly string[];
  readonly label: Record<string, string>;
  readonly canChange: boolean;
  readonly onChange: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>;
}

export function LifecycleControl({
  id,
  status,
  options,
  label,
  canChange,
  onChange,
}: LifecycleControlProps) {
  const [to, setTo] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canChange || options.length === 0) return null;

  function submit() {
    if (to === "") return;
    setError(null);
    startTransition(() => {
      void onChange(id, to).then((r) => {
        if (!r.ok) setError(LIFECYCLE_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
        else setTo("");
      });
    });
  }

  return (
    <>
      <NativeSelect
        aria-label={LIFECYCLE_TEXT.moveTo}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        disabled={pending}
      >
        <option value="">{LIFECYCLE_TEXT.moveTo}</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {label[s] ?? s}
          </option>
        ))}
      </NativeSelect>
      <Button size="sm" onClick={submit} disabled={pending || to === ""}>
        {LIFECYCLE_TEXT.apply}
      </Button>
      {/* The violation code, mapped to a sentence. "Finish or skip the
          outstanding executions" is actionable; "failed" is not. */}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
    </>
  );
}
