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
import { unitOf, type TargetMetric } from "../../domains/planning/lib/target";

// Creating a sales target.
//
// A FORM, and the table it sits above already argued why: a target needs a
// period, a scope, a metric and an amount, and none of them exist until someone
// types them. A row menu is the doorway for changing a number you can see, not
// for bringing one into existence.
//
// Until this shipped there was no doorway at all - `sales_target` stayed empty,
// so `attainment()` had no denominator in any workspace that was not seeded.

export interface SetTargetProps {
  readonly period: string;
  readonly canCreate: boolean;
  readonly territories: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly onCreate: (input: {
    period: string;
    scopeType: "workspace" | "territory" | "owner";
    territoryId: string | null;
    metric: string;
    amount: number;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function SetTarget({
  period,
  canCreate,
  territories,
  onCreate,
}: SetTargetProps) {
  const { PLANNING_TEXT, TARGET_ERROR } = useMessages();
  const [scopeType, setScopeType] = useState<
    "workspace" | "territory" | "owner"
  >("workspace");
  const [territoryId, setTerritoryId] = useState<string>(
    territories[0]?.id ?? "",
  );
  const [metric, setMetric] = useState("revenue");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (!canCreate) return null;

  const METRICS = [
    ["revenue", PLANNING_TEXT.metricRevenue],
    ["new_logo", PLANNING_TEXT.metricNewLogo],
    ["pipeline", PLANNING_TEXT.metricPipeline],
    ["margin", PLANNING_TEXT.metricMargin],
  ] as const;

  // The field asks for what the METRIC is measured in. Before ADR-020 it always
  // said "target amount" and always formatted the result as money, so setting a
  // new-customer target meant typing a currency figure for a headcount.
  const isCount = unitOf(metric as TargetMetric) === "count";

  const n = Number(amount);
  const ready =
    amount.trim() !== "" &&
    Number.isFinite(n) &&
    n >= 0 &&
    // A count is whole. Refusing 2.5 here rather than only in the rule layer
    // means the reader learns it while the number is still in front of them.
    (!isCount || Number.isInteger(n)) &&
    (scopeType !== "territory" || territoryId !== "");

  return (
    <Section
      icon="target"
      title={PLANNING_TEXT.setTarget}
      description={PLANNING_TEXT.setTargetWhy}
    >
      <div className="flex flex-wrap items-end gap-md">
        <Field>
          <FieldLabel>{PLANNING_TEXT.setScope}</FieldLabel>
          <NativeSelect
            value={scopeType}
            onChange={(e) =>
              setScopeType(
                e.target.value as "workspace" | "territory" | "owner",
              )
            }
          >
            <option value="workspace">{PLANNING_TEXT.scopeWorkspace}</option>
            {/* Territory is offered only when territories exist. A scope that
                cannot be completed is a scope the rule layer will reject, and
                offering it would move that refusal from the form to the save. */}
            {territories.length > 0 ? (
              <option value="territory">{PLANNING_TEXT.scopeTerritory}</option>
            ) : null}
            <option value="owner">{PLANNING_TEXT.scopeOwner}</option>
          </NativeSelect>
        </Field>

        {scopeType === "territory" ? (
          <Field>
            <FieldLabel>{PLANNING_TEXT.scopeTerritory}</FieldLabel>
            <NativeSelect
              value={territoryId}
              onChange={(e) => setTerritoryId(e.target.value)}
            >
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}

        <Field>
          <FieldLabel>{PLANNING_TEXT.setMetric}</FieldLabel>
          <NativeSelect
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {METRICS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel>
            {isCount ? PLANNING_TEXT.setCount : PLANNING_TEXT.setAmount}
          </FieldLabel>
          <Input
            type="number"
            min="0"
            step={isCount ? 1 : undefined}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Button
          disabled={!ready || pending}
          onClick={() =>
            start(() => {
              void onCreate({
                period,
                scopeType,
                territoryId: scopeType === "territory" ? territoryId : null,
                metric,
                amount: n,
              }).then((r) => {
                setError(r.ok ? null : (TARGET_ERROR[r.error ?? "denied"] ?? TARGET_ERROR.not_found));
                setSaved(r.ok);
                if (r.ok) setAmount("");
              });
            })
          }
        >
          {PLANNING_TEXT.setSubmit}
        </Button>

        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
        {saved && !error ? (
          <StatusBadge tone="success">{PLANNING_TEXT.setSaved}</StatusBadge>
        ) : null}
      </div>
    </Section>
  );
}
