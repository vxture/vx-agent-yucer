"use client";

import type { ComponentProps } from "react";
import { ConfirmDestructive as DsConfirmDestructive } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// Same reason as dialog-form.tsx: the DS falls back to English ("Cancel",
// "Working…") and a neutral title order, and two confirmations never passed
// them - the 删除客户 dialog showed a "Cancel" button (found 2026-09-24).
// The product's words are the defaults; a caller's explicit label wins.
export function ConfirmDestructive(props: ComponentProps<typeof DsConfirmDestructive>) {
  const { DS_LABELS } = useMessages();
  return (
    <DsConfirmDestructive
      titleTemplate={DS_LABELS.confirmTitleTemplate}
      cancelLabel={DS_LABELS.confirmCancel}
      pendingLabel={DS_LABELS.confirmPending}
      {...props}
    />
  );
}
