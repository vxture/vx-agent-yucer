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
import { unsetWorkspaceMetrics, untargetedTerritories } from "../../domains/planning/lib/suggest";
import { unitOf, type TargetMetric, type TargetScopeType } from "../../domains/planning/lib/target";

// 设定目标 - a page since 2026-09-05. The assistant names the scopes still owed
// an answer this period and NEVER suggests an amount: a quota is a commitment
// somebody carries, and pointing at the blanks is where the assistant's job
// ends - the same line ADR-019 draws for the floor price.
//
// ONE FORM PER FILE - see plan-form.tsx for why the guard demands it.

type Saved = { ok: boolean; error?: string };

export function TargetForm({
  period,
  territories,
  existingTargets,
  metricLabel,
  onCreate,
}: {
  readonly period: string;
  readonly territories: readonly { readonly id: string; readonly name: string; readonly status: string }[];
  readonly existingTargets: readonly {
    readonly period: string;
    readonly scopeType: TargetScopeType;
    readonly territoryId: string | null;
    readonly metric: string;
  }[];
  readonly metricLabel: Record<TargetMetric, string>;
  readonly onCreate: (input: {
    period: string;
    scopeType: TargetScopeType;
    territoryId: string | null;
    metric: string;
    amount: number;
  }) => Promise<Saved>;
}) {
  const { PLANNING_TEXT, TARGET_ERROR, ASSIST_TEXT } = useMessages();
  const active = territories.filter((t) => t.status === "active");
  const [scopeType, setScopeType] = useState<TargetScopeType>("workspace");
  const [territoryId, setTerritoryId] = useState(active[0]?.id ?? "");
  const [metric, setMetric] = useState<TargetMetric>("revenue");
  const [amount, setAmount] = useState("");
  const submit = useFormSubmit("/planning");

  const missingMetrics = useMemo(
    () => unsetWorkspaceMetrics(period, existingTargets),
    [period, existingTargets],
  );
  const missingTerritories = useMemo(
    () => untargetedTerritories(period, territories, existingTargets),
    [period, territories, existingTargets],
  );

  const suggestions: AssistSuggestion[] = [];
  // Scopes still owed an answer this period. NO AMOUNT is ever suggested: a
  // quota is a commitment somebody carries, and the assistant's job stops at
  // pointing to the blanks - the same line ADR-019 draws for the floor price.
  for (const m of missingMetrics.slice(0, 2)) {
    if (scopeType === "workspace" && metric === m) continue;
    suggestions.push({
      id: `metric-${m}`,
      label: ASSIST_TEXT.metricUnset(metricLabel[m] ?? m),
      reason: ASSIST_TEXT.metricUnsetWhy,
      apply: () => {
        setScopeType("workspace");
        setMetric(m);
      },
    });
  }
  for (const t of missingTerritories.slice(0, 2)) {
    suggestions.push({
      id: `terr-${t.id}`,
      label: ASSIST_TEXT.territoryUnset(t.name),
      reason: ASSIST_TEXT.territoryUnsetWhy,
      apply: () => {
        setScopeType("territory");
        setTerritoryId(t.id);
      },
    });
  }

  // What the metric is measured in - a pure function of the metric (ADR-020).
  const isCount = unitOf(metric) === "count";
  const n = Number(amount);
  const ready =
    amount.trim() !== "" &&
    Number.isFinite(n) &&
    n >= 0 &&
    (!isCount || Number.isInteger(n)) &&
    (scopeType !== "territory" || territoryId !== "");

  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="target">
          <div className="flex max-w-xl flex-col gap-md">
            <Field>
              <FieldLabel>{PLANNING_TEXT.setScope}</FieldLabel>
              <NativeSelect
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value as TargetScopeType)}
              >
                <option value="workspace">{PLANNING_TEXT.scopeWorkspace}</option>
                <option value="territory" disabled={active.length === 0}>
                  {PLANNING_TEXT.scopeTerritory}
                </option>
                <option value="owner">{PLANNING_TEXT.scopeOwner}</option>
              </NativeSelect>
            </Field>
            {scopeType === "territory" ? (
              <Field>
                <FieldLabel>{PLANNING_TEXT.territoryName}</FieldLabel>
                <NativeSelect value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
                  {active.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>{PLANNING_TEXT.setMetric}</FieldLabel>
              <NativeSelect value={metric} onChange={(e) => setMetric(e.target.value as TargetMetric)}>
                {Object.entries(metricLabel).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              {/* Asks for what the METRIC is measured in (ADR-020): a count
                  field for new_logo, a money field for the rest. */}
              <FieldLabel>{isCount ? PLANNING_TEXT.setCount : PLANNING_TEXT.setAmount}</FieldLabel>
              <Input
                type="number"
                min="0"
                step={isCount ? 1 : "any"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onCreate({
                        period,
                        scopeType,
                        territoryId: scopeType === "territory" ? territoryId : null,
                        metric,
                        amount: n,
                      }),
                    (c) => TARGET_ERROR[c] ?? TARGET_ERROR.denied,
                  )
                }
              >
                {PLANNING_TEXT.setSubmit}
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
