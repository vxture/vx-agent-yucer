"use client";

import { useState, useTransition } from "react";
import { Button, Drawer, Label, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { RELATION_TYPES, type ContactNode } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";

// Recording a path to the buyer.
//
// This sits beside the decision chain rather than on a settings page, because
// the chain is where the gap is stated. Telling a rep "the economic buyer is
// unreachable" and making them go elsewhere to fix it is how a finding becomes
// something people learn to ignore.
//
// Append-only, so there is no edit affordance: a relationship that changed is a
// new edge. The direction matters and is spelled out in the labels - "A reports
// to B" and "B reports to A" are different facts about who to approach.
//
// A DRAWER NOW, NOT AN INLINE CARD (owner, 2026-09-21: 把记录一次关系这个
// 便捷页面，提成单独弹出面板，入口按钮放到决策链标题行). It used to sit as
// its own permanent Section under the chain, always taking up the same
// vertical space whether or not anyone was about to use it - the same
// "展示和编辑混在一起" shape this session already fixed for 上级/下级、联系人
// and 销售负责人. CONTROLLED, same pattern as those: open/onOpenChange lift
// to decision-chain-detail.tsx, which owns the trigger button in the chain's
// own title row. The two "cannot use this" states (read-only, fewer than two
// people) used to render their own mini-Section; decision-chain-detail.tsx
// now decides whether the TRIGGER even appears, so this component only ever
// mounts when there is something real to do with it.

export interface LinkContactsProps {
  readonly accountId: string;
  readonly contacts: readonly ContactNode[];
  /** contactId -> real name, from the same roster read decision-chain-detail.tsx
   *  already uses for nameOf()/titleOf() (owner, 2026-09-20: 设计图严格对齐 -
   *  the picker was showing the raw contact id, "ct_1 (内线)", because
   *  ContactNode itself carries no name - it is a decision-chain role
   *  record, not a roster row. The real name was one prop away the whole
   *  time, just never threaded through). Falls back to the id for a contact
   *  this map has no entry for, rather than rendering nothing. */
  readonly contactNames: Readonly<Record<string, string>>;
  /** Whether the caller may write relationship edges at all. The component
   *  no longer renders its own "you can't do this" fallback (the trigger
   *  button that would open it is what decision-chain-detail.tsx hides
   *  instead - see its canOpenLinkForm) - this field stays on the props bag
   *  because that gating decision is made one level up, from the same data
   *  this component would otherwise need to re-derive. */
  readonly canLink: boolean;
  /** Shown when the chain currently reports the buyer as unreachable. */
  readonly unreachable: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onLink: (
    accountId: string,
    input: { fromContactId: string; toContactId: string; relationType: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function LinkContacts({
  accountId,
  contacts,
  contactNames,
  unreachable,
  open,
  onOpenChange,
  onLink,
}: LinkContactsProps) {
  const {
    DECISION_ROLE_LABEL,
    RELATION_ERROR,
    RELATION_TEXT,
    RELATION_TYPE_LABEL,
  } = useMessages();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<string>("reports_to");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const label = (c: ContactNode) =>
    `${contactNames[c.id] ?? c.id} (${DECISION_ROLE_LABEL[c.decisionRole] ?? c.decisionRole})`;

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(() => {
      void onLink(accountId, {
        fromContactId: from,
        toContactId: to,
        relationType: type,
      }).then((r) => {
        if (!r.ok)
          setError(RELATION_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
        else {
          setSaved(true);
          setFrom("");
          setTo("");
        }
      });
    });
  }

  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width="sm"
      title={RELATION_TEXT.title}
      description={RELATION_TEXT.description}
      footer={
        <Button
          onClick={submit}
          disabled={pending || from === "" || to === "" || from === to}
        >
          {RELATION_TEXT.submit}
        </Button>
      }
    >
      <div className="flex flex-col gap-md">
        {unreachable ? (
          <StatusBadge tone="info">{RELATION_TEXT.hintUnreachable}</StatusBadge>
        ) : null}

        <Label htmlFor="rel-from">{RELATION_TEXT.from}</Label>
        <NativeSelect
          id="rel-from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          disabled={pending}
        >
          <option value="">{RELATION_TEXT.pick}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </NativeSelect>

        <Label htmlFor="rel-type">{RELATION_TEXT.type}</Label>
        <NativeSelect
          id="rel-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={pending}
        >
          {RELATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {RELATION_TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </NativeSelect>

        <Label htmlFor="rel-to">{RELATION_TEXT.to}</Label>
        <NativeSelect
          id="rel-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={pending}
        >
          <option value="">{RELATION_TEXT.pick}</option>
          {/* The same person on both ends is refused by the rule AND by a CHECK
              constraint; leaving it out of the list keeps the form from offering
              a choice that can only fail. */}
          {contacts
            .filter((c) => c.id !== from)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
        </NativeSelect>

        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
        {saved ? (
          <StatusBadge tone="success">{RELATION_TEXT.saved}</StatusBadge>
        ) : null}
      </div>
    </Drawer>
  );
}
