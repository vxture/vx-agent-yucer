"use client";

import { Button, StatusBadge } from "@vxture/design-ui";
import type { SaveAction } from "../lib/use-save-action";

// The save button and its two outcomes, which every upsert panel had its own
// copy of. See use-save-action.ts for why this was extracted by hand.
//
// The two badges are MUTUALLY EXCLUSIVE by construction rather than by
// discipline: `saved && !err` was written out in each panel, and one of them
// getting it wrong would show "saved" next to a failure.

export interface SaveRowProps {
  readonly action: SaveAction;
  readonly label: string;
  readonly savedLabel: string;
  readonly disabled?: boolean;
  readonly onSave: () => void;
}

export function SaveRow({ action, label, savedLabel, disabled, onSave }: SaveRowProps) {
  return (
    <>
      <Button disabled={disabled || action.pending} onClick={onSave}>
        {label}
      </Button>
      {action.err ? <StatusBadge tone="danger">{action.err}</StatusBadge> : null}
      {action.saved && !action.err ? (
        <StatusBadge tone="success">{savedLabel}</StatusBadge>
      ) : null}
    </>
  );
}
