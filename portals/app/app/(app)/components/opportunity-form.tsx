"use client";

import { useMemo, useState } from "react";
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
import { AssistPanel, FormPage, useFormSubmit, type AssistSuggestion } from "./form-page";
import { accountsWithoutOpenDeal } from "../../domains/pipeline/lib/suggest";
import { coveringTerritories } from "../../domains/planning/lib/suggest";

// 新建商机 - a page since 2026-09-05 (owner ruling; one form per file, see
// plan-form.tsx).
//
// The inline form's rules survive the move unchanged: the account is a PICKER
// (a deal has to hang off a customer); NO stage, probability or category (a
// new deal starts at qualify and the stage machine owns every move); and the
// self-sourced warning stays, because campaign_id is frozen at creation and no
// later edit can attribute the deal to a campaign.

type Saved = { ok: boolean; opportunityNo?: string; error?: string };

export function OpportunityForm({
  accounts,
  territories,
  openDeals,
  onCreate,
}: {
  readonly accounts: readonly {
    readonly id: string;
    readonly name: string;
    readonly region: string | null;
    readonly status: string;
  }[];
  readonly territories: readonly {
    readonly id: string;
    readonly name: string;
    readonly regions: readonly string[];
    readonly status: string;
  }[];
  /** Open deals, for the who-has-none suggestion. */
  readonly openDeals: readonly { readonly accountId: string; readonly status: string }[];
  readonly onCreate: (input: {
    name: string;
    accountId: string;
    territoryId: string | null;
    amount: number | null;
    expectedCloseAt: string | null;
  }) => Promise<Saved>;
}) {
  const { PIPELINE_TEXT, OPPORTUNITY_ERROR, ASSIST_TEXT } = useMessages();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const submit = useFormSubmit("/pipeline");

  const uncovered = useMemo(
    () => accountsWithoutOpenDeal(accounts, openDeals),
    [accounts, openDeals],
  );
  const chosen = accounts.find((a) => a.id === accountId);
  const covering = useMemo(
    () => coveringTerritories(chosen?.region ?? null, territories),
    [chosen, territories],
  );

  const suggestions: AssistSuggestion[] = [];
  // Customers being worked with nothing on the board - where a corridor deal
  // gets heard about first.
  if (accountId === "") {
    for (const a of uncovered.slice(0, 3)) {
      suggestions.push({
        id: `acc-${a.id}`,
        label: ASSIST_TEXT.accountNoDeal(a.name),
        reason: ASSIST_TEXT.accountNoDealWhy,
        apply: () => setAccountId(a.id),
      });
    }
  }
  // The territory whose regions cover the chosen customer - the SAME match
  // lead routing runs, so a deal filed by this suggestion lands where its
  // leads would have. Offered, not applied: overlapping coverage is legal and
  // choosing between two owners is a judgement.
  for (const t of covering) {
    if (territoryId === t.id) continue;
    suggestions.push({
      id: `terr-${t.id}`,
      label: ASSIST_TEXT.territoryCovers(t.name, chosen?.region ?? ""),
      reason: ASSIST_TEXT.territoryCoversWhy,
      apply: () => setTerritoryId(t.id),
    });
  }

  const n = Number(amount);
  const ready =
    name.trim() !== "" &&
    accountId !== "" &&
    (amount.trim() === "" || (Number.isFinite(n) && n >= 0));

  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - see plan-form.tsx.
        <Section icon="plus">
          <div className="flex max-w-xl flex-col gap-md">
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
            {/* Frozen the moment the button is pressed: campaign_id has no
                UPDATE grant, so a deal entered here is self-sourced forever. */}
            <p className="text-muted-foreground text-body-sm">{PIPELINE_TEXT.newSelfSourced}</p>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onCreate({
                        name: name.trim(),
                        accountId,
                        territoryId: territoryId === "" ? null : territoryId,
                        amount: amount.trim() === "" ? null : n,
                        expectedCloseAt: closeAt === "" ? null : closeAt,
                      }),
                    (c) => OPPORTUNITY_ERROR[c] ?? OPPORTUNITY_ERROR.denied,
                  )
                }
              >
                {PIPELINE_TEXT.newSave}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}
