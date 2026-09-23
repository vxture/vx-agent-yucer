"use client";

import type { ComponentProps } from "react";
import { DialogForm as DsDialogForm } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The DS DialogForm's fallbacks are English - "Save", "Cancel", "Working…" -
// and eight of this app's dialogs never passed them (found 2026-09-24 by
// opening 调整条款: a "Cancel" button in a Chinese dialog, and every save
// flashed "Working…"). This wrapper supplies the product's own words as the
// DEFAULTS; a caller's explicit label still wins. Imported everywhere instead
// of the DS one - dialog-form.test.ts keeps it that way.
export function DialogForm(props: ComponentProps<typeof DsDialogForm>) {
  const { DS_LABELS } = useMessages();
  return (
    <DsDialogForm
      submitLabel={DS_LABELS.dialogSave}
      cancelLabel={DS_LABELS.confirmCancel}
      pendingLabel={DS_LABELS.confirmPending}
      {...props}
    />
  );
}
