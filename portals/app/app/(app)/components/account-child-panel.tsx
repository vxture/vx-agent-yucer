"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  ConfirmDestructive,
  DialogForm,
  Field,
  FieldLabel,
  Icon,
  NativeSelect,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 下级单位增删 (owner, 2026-09-20: mockup 编辑单位信息 - "+关联下级单位" +
// 每行的移除). 复用 account-parent-panel.tsx 已经建好的同一条动词
// (setAccountParent) 和同一套排除子树算法 - 这里改的是"另一家公司自己的
// 上级公司"这一格, 不是这家公司自己的, 但底层是同一个写路径、同一条
// 服务端规则 (含环检查)。

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

export interface AccountChildPanelProps {
  readonly accountId: string;
  readonly children: readonly { id: string; name: string }[];
  readonly accounts: readonly { id: string; name: string; parentId: string | null }[];
  readonly canWrite: boolean;
  readonly onSetParent: (
    accountId: string,
    parentId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function AccountChildPanel({ accountId, children, accounts, canWrite, onSetParent }: AccountChildPanelProps) {
  const { ACCOUNT_ERROR, ACCOUNT_PARENT_TEXT, ACCOUNT_TEXT } = useMessages();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();

  const excluded = subtreeOf(accounts, accountId);
  const candidates = accounts.filter((a) => !excluded.has(a.id));

  const openDialog = () => {
    setTarget("");
    setOpen(true);
  };

  const addChild = () =>
    start(async () => {
      if (!target) return;
      const res = await onSetParent(target, accountId);
      if (!res.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[res.error ?? "denied"] ?? res.error });
        return;
      }
      setOpen(false);
    });

  const removeChild = (childId: string) =>
    start(async () => {
      const res = await onSetParent(childId, null);
      if (!res.ok) toast({ tone: "danger", title: ACCOUNT_ERROR[res.error ?? "denied"] ?? res.error });
      setRemoving(null);
    });

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between gap-sm">
        <span className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.orgUnitChildren(children.length)}</span>
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={openDialog}>
            {ACCOUNT_PARENT_TEXT.addChild}
          </Button>
        ) : null}
      </div>
      {children.length > 0 ? (
        <div className="flex flex-col">
          {children.map((c) => (
            <div key={c.id} className="gap-sm border-border flex items-center border-b py-2xs last:border-b-0">
              <Link href={`/account/${c.id}`} className="text-muted-foreground hover:text-foreground min-w-0 flex-1 truncate text-body-sm hover:underline">
                {c.name}
              </Link>
              {canWrite ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={ACCOUNT_PARENT_TEXT.removeChild}
                  title={ACCOUNT_PARENT_TEXT.removeChild}
                  onClick={() => setRemoving(c)}
                >
                  <Icon name="x" size="sm" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <DialogForm
        open={open}
        onOpenChange={(o) => { if (!o) setOpen(false); }}
        title={ACCOUNT_PARENT_TEXT.addChildTitle}
        description={ACCOUNT_PARENT_TEXT.addChildWhy}
        submitLabel={ACCOUNT_PARENT_TEXT.submit}
        cancelLabel={ACCOUNT_PARENT_TEXT.cancel}
        submitDisabled={pending || !target}
        onSubmit={(e) => {
          e.preventDefault();
          addChild();
        }}
      >
        <Field>
          <FieldLabel>{ACCOUNT_PARENT_TEXT.addChildField}</FieldLabel>
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} disabled={pending}>
            <option value="">{ACCOUNT_PARENT_TEXT.addChildPick}</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </DialogForm>

      {removing ? (
        <ConfirmDestructive
          open={!!removing}
          onOpenChange={(o) => { if (!o) setRemoving(null); }}
          verb={ACCOUNT_PARENT_TEXT.removeChildVerb}
          target={removing.name}
          consequence={ACCOUNT_PARENT_TEXT.removeChildConsequence}
          onConfirm={() => removeChild(removing.id)}
        />
      ) : null}
    </div>
  );
}
