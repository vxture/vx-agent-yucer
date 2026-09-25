"use client";

import { useState, useTransition } from "react";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  NativeSelect,
  StatusBadge,
} from "@vxture/design-ui";
import { DialogForm } from "./dialog-form";
import {
  FORECAST_CATEGORIES,
  type ForecastCategory,
} from "../../domains/pipeline/lib/forecast";
import {
  DEFAULT_STAGE_DEFINITIONS,
  defaultProbabilityFor,
  isTerminal,
  type Stage,
  type StageDefinition,
} from "../../domains/pipeline/lib/stage";
import { useMessages } from "../lib/i18n/provider";
import { useDealEditor } from "./deal-edit-context";

// What the deal is worth, and how sure we are - A DIALOG since 2026-09-05.
//
// CONTROLLED since deal batch 2 (2026-09-25): the dialog is one door opened
// from several places - the crumbs row's "⋮" and 交易档案's own "⋮" - the
// customer page's 客户总编辑 pattern (account-edit-context.tsx). The card that
// used to host its button is gone: every fact it summarised now lives in
// exactly one panel (交易档案, 推进进程, 报价与审批).
//
// The analysis behind the change: these are five independent single-field
// facts, each a quick correction made WHILE LOOKING at the metrics the page
// already shows - not a coherent creation flow. A page would add a round trip
// to a one-field tweak; a permanent inline form was a form squatting on a
// display page. The ruling's own category is "flow operation → dialog", and
// this is one.
//
// Everything the inline form knew survives verbatim:
//   - only what the user CHANGED is sent (dirty-patch), so an untouched field
//     can never carry a refusal for the whole save;
//   - a closed deal's win rate is fixed by the stage machine and never sent;
//   - the category select offers only the pairings planCategoryChange accepts.

export interface DealTermsProps {
  readonly opportunityId: string;
  readonly stage: Stage;
  readonly amount: number | null;
  readonly currency: string;
  readonly probability: number | null;
  readonly expectedCloseAt: Date | null;
  readonly forecastCategory: ForecastCategory;
  readonly canEdit: boolean;
  /** The forecast bucket is a pro capability with its own permission; the
   * select is only rendered when the member actually holds it. */
  readonly canCategorize: boolean;
  /** The workspace's own stage catalog (incr/0057) - see StageControlProps'
   *  own note on why this is optional and defaulted. */
  readonly stageDefinitions?: readonly StageDefinition[];
  /** incr/0067 - 签约类型 / 业务形态, this deal's current ones, or null. Two
   *  selects because they are two questions: what kind of transaction this is,
   *  and what is being sold. */
  readonly contractTypeId?: string | null;
  readonly businessFormId?: string | null;
  /** The workspace's own catalogs, for the pickers. Empty by default: a page
   *  that has not fetched them still compiles and simply offers none. */
  readonly contractTypes?: readonly { readonly id: string; readonly name: string }[];
  readonly businessForms?: readonly { readonly id: string; readonly name: string }[];
  /** `pipeline.opportunity.update` - the same gate updateCommercialTerms
   *  enforces for these two fields, so the selects are offered only when the
   *  member actually holds it. */
  readonly canSetDealType?: boolean;
  /** incr/0080 - 客户项目总投入, in `currency`; null = not entered. Rides on
   *  the editing gate: the rep who owns the deal is the one who asked (§9.6). */
  readonly customerBudget?: number | null;
  readonly onSave: (
    opportunityId: string,
    input: {
      amount?: string;
      currency?: string;
      probability?: string;
      expectedCloseAt?: string;
      forecastCategory?: string;
      contractTypeId?: string;
      businessFormId?: string;
      customerBudget?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const asDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function DealTerms({
  opportunityId,
  stage,
  amount,
  currency,
  probability,
  expectedCloseAt,
  forecastCategory,
  canEdit,
  canCategorize,
  stageDefinitions = DEFAULT_STAGE_DEFINITIONS,
  contractTypeId = null,
  businessFormId = null,
  contractTypes = [],
  businessForms = [],
  canSetDealType = false,
  customerBudget = null,
  onSave,
}: DealTermsProps) {
  const { BUSINESS_FORM_TEXT, CONTRACT_TYPE_TEXT, FORECAST_LABEL, OPPORTUNITY_ERROR, OPPORTUNITY_TEXT, WALLET_TEXT } =
    useMessages();
  const { open, onOpenChange: setOpen } = useDealEditor("terms");
  const closed = isTerminal(stage, stageDefinitions);
  const initial = {
    amount: amount == null ? "" : String(amount),
    probability: probability == null ? "" : String(probability),
    expectedCloseAt: asDateInput(expectedCloseAt),
    forecastCategory,
    contractTypeId: contractTypeId ?? "",
    businessFormId: businessFormId ?? "",
    customerBudget: customerBudget == null ? "" : String(customerBudget),
  };
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Reopen from the CURRENT server values, not from a stale draft: a save (or
  // someone else's) may have moved them since last time.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial);
      setError(null);
    }
  }

  /** The value if the user changed it, undefined if they did not. */
  const dirty = (k: keyof typeof initial): string | undefined =>
    form[k] === initial[k] ? undefined : form[k];

  // No door for a member who cannot edit: the menus grey the item out.
  if (!canEdit) return null;

  function save() {
    setError(null);
    startTransition(() => {
      // Only what the user actually CHANGED. Sending every field meant an
      // untouched one could carry a refusal for the whole save: a deal closed
      // through the stage control keeps whatever bucket it had, so resubmitting
      // that bucket against a now-terminal stage failed the entire edit and
      // named a field nobody touched.
      //
      // updateCommercialTerms refuses a fully empty patch with `empty_patch`,
      // so "changed nothing" still gets an honest answer.
      void onSave(opportunityId, {
        amount: dirty("amount"),
        currency,
        // A closed deal's win rate is fixed by the stage machine, so it is
        // never sent. Sending it would earn a terminal_probability_fixed
        // refusal for a field the user could not have changed.
        probability: closed ? undefined : dirty("probability"),
        expectedCloseAt: dirty("expectedCloseAt"),
        forecastCategory: canCategorize ? dirty("forecastCategory") : undefined,
        contractTypeId: canSetDealType ? dirty("contractTypeId") : undefined,
        businessFormId: canSetDealType ? dirty("businessFormId") : undefined,
        customerBudget: dirty("customerBudget"),
      }).then((r) => {
        if (!r.ok) {
          setError(
            OPPORTUNITY_ERROR[r.error ?? "denied"] ?? r.error ?? "denied",
          );
        } else {
          setOpen(false);
        }
      });
    });
  }

  return (
      <DialogForm
        open={open}
        onOpenChange={setOpen}
        title={OPPORTUNITY_TEXT.termsTitle}
        description={OPPORTUNITY_TEXT.termsDescription}
        submitLabel={OPPORTUNITY_TEXT.termsSubmit}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {/* FIELD GROUPS, and the currency is a DESCRIPTION not part of the
            label: the dialog's form is flex-col gap-lg, so loose labels
            floated off their controls and a label carrying "(CNY)" wrapped
            (owner, 2026-09-05). A label is the field's name, nothing else. */}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="terms-amount">
              {OPPORTUNITY_TEXT.termsAmount}
            </FieldLabel>
            <Input
              id="terms-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              disabled={pending}
            />
            <FieldDescription>{currency}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="terms-customer-budget">
              {WALLET_TEXT.fieldLabel}
            </FieldLabel>
            <Input
              id="terms-customer-budget"
              inputMode="decimal"
              value={form.customerBudget}
              onChange={(e) => setForm({ ...form, customerBudget: e.target.value })}
              disabled={pending}
            />
            <FieldDescription>{WALLET_TEXT.fieldHint(currency)}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="terms-probability">
              {OPPORTUNITY_TEXT.termsProbability}
            </FieldLabel>
            <Input
              id="terms-probability"
              inputMode="numeric"
              value={
                closed ? String(defaultProbabilityFor(stage, stageDefinitions)) : form.probability
              }
              onChange={(e) =>
                setForm({ ...form, probability: e.target.value })
              }
              disabled={pending || closed}
            />
            {closed ? (
              <FieldDescription>
                {OPPORTUNITY_TEXT.termsTerminalLocked}
              </FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="terms-close">
              {OPPORTUNITY_TEXT.termsExpectedClose}
            </FieldLabel>
            <Input
              id="terms-close"
              type="date"
              value={form.expectedCloseAt}
              onChange={(e) =>
                setForm({ ...form, expectedCloseAt: e.target.value })
              }
              disabled={pending}
            />
          </Field>

          {canCategorize ? (
            <Field>
              <FieldLabel htmlFor="terms-forecast">
                {OPPORTUNITY_TEXT.termsForecast}
              </FieldLabel>
              <NativeSelect
                id="terms-forecast"
                value={form.forecastCategory}
                onChange={(e) =>
                  setForm({
                    ...form,
                    forecastCategory: e.target.value as ForecastCategory,
                  })
                }
                disabled={pending}
              >
                {FORECAST_CATEGORIES.map((c) => (
                  // `closed` is offered only on a terminal deal, and the open
                  // three only on an open one - planCategoryChange refuses the
                  // other pairings in both directions, so offering them would be
                  // offering a refusal.
                  <option
                    key={c}
                    value={c}
                    disabled={c === "closed" ? !closed : closed}
                  >
                    {FORECAST_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          {canSetDealType ? (
            <Field>
              <FieldLabel htmlFor="terms-contract-type">
                {CONTRACT_TYPE_TEXT.title}
              </FieldLabel>
              <NativeSelect
                id="terms-contract-type"
                value={form.contractTypeId}
                onChange={(e) =>
                  setForm({ ...form, contractTypeId: e.target.value })
                }
                disabled={pending}
              >
                <option value="">{OPPORTUNITY_TEXT.selectNone}</option>
                {contractTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          {canSetDealType ? (
            <Field>
              <FieldLabel htmlFor="terms-business-form">
                {BUSINESS_FORM_TEXT.title}
              </FieldLabel>
              <NativeSelect
                id="terms-business-form"
                value={form.businessFormId}
                onChange={(e) =>
                  setForm({ ...form, businessFormId: e.target.value })
                }
                disabled={pending}
              >
                <option value="">{OPPORTUNITY_TEXT.selectNone}</option>
                {businessForms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
        </FieldGroup>

        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </DialogForm>
  );
}
