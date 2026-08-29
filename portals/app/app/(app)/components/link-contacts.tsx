"use client";

import { useState, useTransition } from "react";
import { Button, Label, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { RELATION_TYPES, type ContactNode } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";

// Recording a path to the buyer.
//
// This sits inside the decision chain rather than on a settings page, because
// the chain is where the gap is stated. Telling a rep "the economic buyer is
// unreachable" and making them go elsewhere to fix it is how a finding becomes
// something people learn to ignore.
//
// Append-only, so there is no edit affordance: a relationship that changed is a
// new edge. The direction matters and is spelled out in the labels - "A reports
// to B" and "B reports to A" are different facts about who to approach.

export interface LinkContactsProps {
  readonly accountId: string;
  readonly contacts: readonly ContactNode[];
  readonly canLink: boolean;
  /** Shown when the chain currently reports the buyer as unreachable. */
  readonly unreachable: boolean;
  readonly onLink: (
    accountId: string,
    input: { fromContactId: string; toContactId: string; relationType: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function LinkContacts({
  accountId,
  contacts,
  canLink,
  unreachable,
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

  if (!canLink)
    return <StatusBadge tone="neutral">{RELATION_TEXT.readOnly}</StatusBadge>;
  if (contacts.length < 2)
    return <StatusBadge tone="neutral">{RELATION_TEXT.needTwo}</StatusBadge>;

  const label = (c: ContactNode) =>
    `${c.id} (${DECISION_ROLE_LABEL[c.decisionRole] ?? c.decisionRole})`;

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
    <div>
      <p>{RELATION_TEXT.description}</p>
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

      <Button
        onClick={submit}
        disabled={pending || from === "" || to === "" || from === to}
      >
        {RELATION_TEXT.submit}
      </Button>

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {saved ? (
        <StatusBadge tone="success">{RELATION_TEXT.saved}</StatusBadge>
      ) : null}
    </div>
  );
}
