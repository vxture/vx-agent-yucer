"use client";

import { useState, useTransition } from "react";
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

// 上下级关联 (owner, 2026-09-20: 死死记住设计文件 - mockup 原话在
// scratchpad/account-detail-v2-wrapped.html 里说得很清楚：只读的单位信息卡片
// 上,"上级公司: shown ONLY when one exists...the whole row (and its own
// change-button) is absent...a dossier card states facts, it does not carry
// an empty-state CTA for every fact that could exist" - 之前把"+关联上级公司"/
// "+关联下级单位"两个按钮直接摆在只读卡片上是错的, 已经删掉。
//
// mockup 把"上下级关联"画成 orgEditView 里紧跟在"基础信息"后面的一张独立
// card, 用的是同一个编辑入口 - 这里就是那张 card 的内容, 挂在
// account-basics-form.tsx 的 Drawer 里, 不是自己另开一个入口。跟销售负责人
// 不一样: 销售负责人在 ACCOUNT_BASICS_TEXT.why 里明确说"另有自己的卡片",
// 上下级关联没有这句话, 而且"单位信息"这个标题本来就该包含上级/下级这两个
// 组织结构事实, 跟行业/区域一样。
//
// setAccountParent/planAccountParent 和 DB 的 FK/CHECK 从 incr/0025 就在;
// 这里只是把 account-parent-panel.tsx (只读卡片上的浮动按钮) 和
// account-child-panel.tsx 的编辑逻辑合并搬进这一张卡, 动词完全没变。

/** Every id in `id`'s own subtree, `id` itself included - what both pickers
 *  must exclude, or a company could become its own ancestor. The server's own
 *  cycle guard (planAccountParent) still refuses it either way; this just
 *  keeps the pickers from ever offering a choice that would be. */
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

export interface OrgRelationsEditorProps {
  readonly accountId: string;
  readonly parentId: string | null;
  readonly children: readonly { id: string; name: string }[];
  readonly accounts: readonly { id: string; name: string; parentId: string | null }[];
  readonly onSetParent: (
    accountId: string,
    parentId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function OrgRelationsEditor({
  accountId,
  parentId,
  children,
  accounts,
  onSetParent,
}: OrgRelationsEditorProps) {
  const { ACCOUNT_ERROR, ACCOUNT_PARENT_TEXT, ACCOUNT_TEXT } = useMessages();
  const { toast } = useToast();
  const [parentValue, setParentValue] = useState(parentId ?? "");
  const [parentPending, startParent] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState("");
  const [addPending, startAdd] = useTransition();
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [removePending, startRemove] = useTransition();

  const excluded = subtreeOf(accounts, accountId);
  const candidates = accounts.filter((a) => !excluded.has(a.id));

  const applyParent = () =>
    startParent(async () => {
      const nextParentId = parentValue === "" ? null : parentValue;
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
    });

  const addChild = () =>
    startAdd(async () => {
      if (!addTarget) return;
      const res = await onSetParent(addTarget, accountId);
      if (!res.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[res.error ?? "denied"] ?? res.error });
        return;
      }
      setAddOpen(false);
      setAddTarget("");
    });

  const removeChild = (childId: string) =>
    startRemove(async () => {
      const res = await onSetParent(childId, null);
      if (!res.ok) toast({ tone: "danger", title: ACCOUNT_ERROR[res.error ?? "denied"] ?? res.error });
      setRemoving(null);
    });

  return (
    <div className="flex flex-col gap-sm">
      <h4 className="text-body-sm font-bold">{ACCOUNT_PARENT_TEXT.sectionTitle}</h4>

      <Field>
        <FieldLabel>{ACCOUNT_PARENT_TEXT.field}</FieldLabel>
        <div className="gap-sm flex items-center">
          <NativeSelect
            value={parentValue}
            onChange={(e) => setParentValue(e.target.value)}
            disabled={parentPending}
          >
            <option value="">{ACCOUNT_PARENT_TEXT.none}</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </NativeSelect>
          <Button
            variant="secondary"
            size="sm"
            disabled={parentPending || parentValue === (parentId ?? "")}
            onClick={applyParent}
          >
            {ACCOUNT_PARENT_TEXT.change}
          </Button>
        </div>
      </Field>

      <div className="flex flex-col gap-2xs">
        <span className="text-muted-foreground text-body-sm">
          {ACCOUNT_TEXT.orgUnitChildren(children.length)}
        </span>
        {children.map((c) => (
          <div key={c.id} className="gap-sm border-border flex items-center border-b py-2xs last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-body-sm">{c.name}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={ACCOUNT_PARENT_TEXT.removeChild}
              title={ACCOUNT_PARENT_TEXT.removeChild}
              onClick={() => setRemoving(c)}
            >
              <Icon name="x" size="sm" />
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setAddOpen(true)}>
          {ACCOUNT_PARENT_TEXT.addChild}
        </Button>
      </div>

      <DialogForm
        open={addOpen}
        onOpenChange={(o) => { if (!o) setAddOpen(false); }}
        title={ACCOUNT_PARENT_TEXT.addChildTitle}
        description={ACCOUNT_PARENT_TEXT.addChildWhy}
        submitLabel={ACCOUNT_PARENT_TEXT.submit}
        cancelLabel={ACCOUNT_PARENT_TEXT.cancel}
        submitDisabled={addPending || !addTarget}
        onSubmit={(e) => {
          e.preventDefault();
          addChild();
        }}
      >
        <Field>
          <FieldLabel>{ACCOUNT_PARENT_TEXT.addChildField}</FieldLabel>
          <NativeSelect value={addTarget} onChange={(e) => setAddTarget(e.target.value)} disabled={addPending}>
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
