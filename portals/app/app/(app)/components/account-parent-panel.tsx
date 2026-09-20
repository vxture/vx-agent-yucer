"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DialogForm,
  Field,
  FieldLabel,
  NativeSelect,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 上级公司 (incr/0025, ADR-024 batch B) - the one surface that was missing.
//
// setAccountParent, planAccountParent and the DB's own FK/CHECK have existed
// since incr/0025; this is only the click-through. Same shape as org-panel's
// "迁到…" dialog: a fact line plus a button that opens a single-field
// DialogForm, because a relationship that changes by acquisition rather than
// by routine editing does not deserve a permanently-open form on the page.

/** Every id in `id`'s own subtree, `id` itself included - what the picker must
 *  exclude, or a company could be set as its own subsidiary's parent. Same
 *  algorithm as org-panel.tsx's `subtreeOf`; the server's own cycle guard
 *  (planAccountParent) still refuses it either way, this just keeps the
 *  picker from ever offering a choice that would be. */
function subtreeOf(rows: readonly { id: string; parentId: string | null }[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && out.has(r.parentId) && !out.has(r.id)) {
        out.add(r.id);
        grew = true;
      }
    }
  }
  return out;
}

export interface AccountParentPanelProps {
  readonly accountId: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  /** The workspace's other accounts, minimal projection - used only to build
   *  the picker's candidate list and to exclude this account's own subtree. */
  readonly accounts: readonly { id: string; name: string; parentId: string | null }[];
  readonly canWrite: boolean;
  readonly onSetParent: (
    accountId: string,
    parentId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function AccountParentPanel({
  accountId,
  parentId,
  parentName,
  accounts,
  canWrite,
  onSetParent,
}: AccountParentPanelProps) {
  const { ACCOUNT_ERROR, ACCOUNT_PARENT_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(parentId ?? "");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const openDialog = () => {
    setTarget(parentId ?? "");
    setOpen(true);
  };

  const submit = () =>
    start(async () => {
      const nextParentId = target === "" ? null : target;
      const res = await onSetParent(accountId, nextParentId);
      if (!res.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[res.error ?? "denied"] ?? res.error });
        return;
      }
      const nextName = accounts.find((a) => a.id === nextParentId)?.name ?? null;
      toast({
        tone: "success",
        title: nextName ? ACCOUNT_PARENT_TEXT.done(nextName) : ACCOUNT_PARENT_TEXT.doneNone,
      });
      setOpen(false);
    });

  const excluded = subtreeOf(accounts, accountId);

  return (
    <div className="gap-sm flex flex-wrap items-center">
      {/* 没有上级公司时不打印"无上级公司"这句空事实 (owner, 2026-09-20: 设计
          图严格对齐) - 只留一个轻量的关联入口，见 ACCOUNT_PARENT_TEXT.associate
          自己的注释。 */}
      {parentName ? (
        <>
          <span className="text-muted-foreground text-body-sm">{ACCOUNT_PARENT_TEXT.label}</span>
          <span className="text-body-sm">{parentName}</span>
          {canWrite ? (
            <Button variant="secondary" size="sm" onClick={openDialog}>
              {ACCOUNT_PARENT_TEXT.change}
            </Button>
          ) : null}
        </>
      ) : canWrite ? (
        <Button variant="ghost" size="sm" onClick={openDialog}>
          {ACCOUNT_PARENT_TEXT.associate}
        </Button>
      ) : null}

      <DialogForm
        open={open}
        onOpenChange={(o) => { if (!o) setOpen(false); }}
        title={ACCOUNT_PARENT_TEXT.change}
        description={ACCOUNT_PARENT_TEXT.dialogWhy}
        submitLabel={ACCOUNT_PARENT_TEXT.submit}
        cancelLabel={ACCOUNT_PARENT_TEXT.cancel}
        submitDisabled={pending}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field>
          <FieldLabel>{ACCOUNT_PARENT_TEXT.field}</FieldLabel>
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} disabled={pending}>
            <option value="">{ACCOUNT_PARENT_TEXT.none}</option>
            {accounts
              .filter((a) => !excluded.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
          </NativeSelect>
        </Field>
      </DialogForm>
    </div>
  );
}
