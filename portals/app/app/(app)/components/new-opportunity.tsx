"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// Entering a deal nobody generated for you.
//
// Until now a deal could only be born from a lead: convertLeadToOpportunity was
// the sole caller of createOpportunity, so a rep who heard about one in a
// corridor had nowhere to put it. The action `pipeline.opportunity.create` had
// been in the catalogue since batch 1 with nothing behind it (TD-016), and the
// attribution rule already had a `self_sourced` branch that nothing could
// reach.
//
// THE ACCOUNT IS A PICKER, NOT A FIELD. A deal has to hang off a customer -
// every judgement rule in D4 reads deals through the account - and a typed id
// would either be wrong or would need this form to invent an account, which is
// a different domain's decision.
//
// NO STAGE, NO PROBABILITY, NO CATEGORY. A new deal starts at qualify with the
// stage's default probability, and the stage machine owns every move after
// that. Offering them here would be offering a way to start a deal in a state
// its own history cannot explain.

export interface NewOpportunityProps {
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
  readonly territories: readonly { readonly id: string; readonly name: string }[];
  readonly canCreate: boolean;
  readonly onCreate: (input: {
    name: string;
    accountId: string;
    territoryId: string | null;
    amount: number | null;
    expectedCloseAt: string | null;
  }) => Promise<{ ok: boolean; opportunityNo?: string; error?: string }>;
}

export function NewOpportunity({
  accounts,
  territories,
  canCreate,
  onCreate,
}: NewOpportunityProps) {
  const { PIPELINE_TEXT, OPPORTUNITY_ERROR } = useMessages();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = Number(amount);
  const ready =
    name.trim() !== "" &&
    accountId !== "" &&
    (amount.trim() === "" || (Number.isFinite(n) && n >= 0));

  if (!canCreate) return null;

  return (
    <Section
      icon="plus"
      title={PIPELINE_TEXT.newTitle}
      description={PIPELINE_TEXT.newWhy}
    >
      <div className="flex flex-wrap items-end gap-sm">
        <Field>
          <FieldLabel>{PIPELINE_TEXT.newName}</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{PIPELINE_TEXT.newAccount}</FieldLabel>
          <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{PIPELINE_TEXT.newPickAccount}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>{PIPELINE_TEXT.newTerritory}</FieldLabel>
          <NativeSelect value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
            <option value="">{PIPELINE_TEXT.newNoTerritory}</option>
            {territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>{PIPELINE_TEXT.newAmount}</FieldLabel>
          <Input
            type="number"
            min="0"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{PIPELINE_TEXT.newExpectedClose}</FieldLabel>
          <Input type="date" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
        </Field>
        <Button
          disabled={!ready || pending}
          onClick={() =>
            start(() => {
              void onCreate({
                name: name.trim(),
                accountId,
                territoryId: territoryId === "" ? null : territoryId,
                amount: amount.trim() === "" ? null : n,
                expectedCloseAt: closeAt === "" ? null : closeAt,
              }).then((r) => {
                setErr(r.ok ? null : (OPPORTUNITY_ERROR[r.error ?? "denied"] ?? r.error ?? ""));
                setMade(r.ok ? (r.opportunityNo ?? "") : null);
                if (r.ok) {
                  setName("");
                  setAmount("");
                }
              });
            })
          }
        >
          {PIPELINE_TEXT.newSave}
        </Button>
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
        {made && !err ? (
          <StatusBadge tone="success">{PIPELINE_TEXT.newMade(made)}</StatusBadge>
        ) : null}
      </div>
      {/* Said out loud, because it is frozen the moment this button is pressed:
          campaign_id has no UPDATE grant, so a deal entered here is
          self-sourced forever and no later edit can attribute it to a
          campaign. */}
      <p className="text-muted-foreground mt-sm text-body-sm">{PIPELINE_TEXT.newSelfSourced}</p>
    </Section>
  );
}
