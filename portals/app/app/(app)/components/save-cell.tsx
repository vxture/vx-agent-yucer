"use client";

import { useSaveAction } from "../lib/use-save-action";
import { SaveRow } from "./save-row";

// One row's save button, with its own state.
//
// WHY THIS EXISTS, and it is a defect found by clicking rather than by a test.
// `useSaveAction` holds ONE `saved`/`err` pair, which is right for a panel with
// one save button - the shape it was extracted from. A table with a button per
// row calls the hook once in the table component, so every SaveRow reads the
// same pair: applying row 2 painted "created" beside row 1, and a denial on row
// 3 would have printed the refusal beside every other row on the page.
//
// Seen on /renewal, where the acted-on row loses its button and the badge
// therefore lands somewhere visibly wrong. /routing has the same construction
// and the badge merely landed on the row above, which is the same bug being
// harder to notice.
//
// The fix has to be a COMPONENT, not a second hook call in the cell callback:
// `cell` is invoked inside the table's render, and a hook there would be a hook
// in a callback. One instance per row is what gives each row its own state.

export interface SaveCellProps {
  /** The domain's code -> sentence dictionary (TD-010: never a rule sentence). */
  readonly errors: Record<string, string>;
  readonly label: string;
  readonly savedLabel: string;
  readonly disabled?: boolean;
  readonly onSave: () => Promise<{ ok: boolean; error?: string }>;
}

export function SaveCell({ errors, label, savedLabel, disabled, onSave }: SaveCellProps) {
  const save = useSaveAction(errors);
  return (
    <SaveRow
      action={save}
      label={label}
      savedLabel={savedLabel}
      disabled={disabled}
      onSave={() => save.run(onSave)}
    />
  );
}
