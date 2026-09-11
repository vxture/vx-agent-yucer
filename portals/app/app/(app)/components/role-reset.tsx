"use client";

import { useState } from "react";
import { Banner, Button, ConfirmDestructive, DialogForm, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { resetPresetRolesAction } from "../admin/roles/actions";

/* 应用模版 (owner, 2026-09-11: 重置预置改名应用模版) - put the nine preset
 * roles back the way the catalogue seeds them.
 *
 * BESIDE 新建, in the page header's action slot, like the division roster's.
 * Unlike that one there is nothing to choose - there is one set of presets -
 * so the dialog states what the reset would change, in this workspace's
 * numbers, and the danger banner says it cannot be undone.
 *
 * TWO STEPS, THE SECOND DESTRUCTIVE (owner, 2026-09-09: 配置首页的重置预置也
 * 需要危险确认，并提示危险性): the dialog states the cost; 确认重置 opens the
 * DS's destructive confirmation - verb, target, consequence - and only that
 * lands the change. Custom roles are never touched, and the copy says so.
 */
export function RoleReset({ changed, missing }: {
  /** Presets the workspace edited (name, description or grants). */
  readonly changed: number;
  /** Presets the workspace deleted. */
  readonly missing: number;
}) {
  const { DS_LABELS, ROLE_ERROR, ROLE_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const run = async () => {
    const r = await resetPresetRolesAction();
    if (!r.ok) {
      toast({ tone: "danger", title: ROLE_ERROR[r.error] ?? r.error });
      throw new Error(r.error);
    }
    toast({ tone: "success", title: ROLE_TEXT.resetDone(r.restored) });
    setConfirming(false);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {ROLE_TEXT.resetAllButton}
      </Button>
      <DialogForm
        open={open}
        onOpenChange={setOpen}
        title={ROLE_TEXT.resetAllTitle}
        description={ROLE_TEXT.resetAllWhy}
        submitLabel={ROLE_TEXT.resetAllConfirm}
        cancelLabel={ROLE_TEXT.cancel}
        pendingLabel={DS_LABELS.confirmPending}
        /* Nothing to reset is nothing to confirm. */
        submitDisabled={changed + missing === 0}
        danger
        onSubmit={(e) => {
          e.preventDefault();
          setConfirming(true);
        }}
      >
        <Banner
          tone={changed + missing === 0 ? "info" : "danger"}
          title={changed + missing === 0 ? ROLE_TEXT.resetAllTitle : ROLE_TEXT.resetAllDangerTitle}
          description={ROLE_TEXT.resetAllWarn(changed, missing)}
        />
      </DialogForm>
      <ConfirmDestructive
        open={confirming}
        onOpenChange={setConfirming}
        verb={ROLE_TEXT.resetAllVerb}
        target={ROLE_TEXT.resetAllTarget}
        consequence={ROLE_TEXT.resetAllConsequence(changed, missing)}
        titleTemplate={ROLE_TEXT.destructiveTitle}
        cancelLabel={ROLE_TEXT.cancel}
        pendingLabel={DS_LABELS.confirmPending}
        onConfirm={run}
      />
    </>
  );
}
