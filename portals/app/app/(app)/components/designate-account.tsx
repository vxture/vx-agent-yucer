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

// Designating an account's tier, with the plan a strategic one requires.
//
// THE PLAN FIELDS APPEAR ONLY FOR `strategic`, and the rule layer refuses
// without them. That is not a form convenience: ADR-013's whole point is that
// the cadence rule is the ONLY rule that can fire for an account with no open
// deal, and it reads the plan. A strategic designation with no plan is a label
// on a customer that changes which rules run - to none.

export interface DesignateAccountProps {
  readonly accountId: string;
  readonly tier: string;
  readonly period: string;
  readonly canWrite: boolean;
  readonly onDesignate: (input: {
    accountId: string;
    tier: string;
    plan?: {
      period: string;
      targetAmount: number | null;
      contactCadenceDays: number;
      execCadenceDays: number;
    };
  }) => Promise<{ ok: boolean; tier?: string; error?: string }>;
}

export function DesignateAccount({
  accountId,
  tier,
  period,
  canWrite,
  onDesignate,
}: DesignateAccountProps) {
  const { ACCOUNT_ERROR, POSITION_TEXT } = useMessages();
  const [next, setNext] = useState(tier);
  const [target, setTarget] = useState("");
  const [contact, setContact] = useState("30");
  const [exec, setExec] = useState("90");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!canWrite) return null;

  const TIERS = [
    ["standard", POSITION_TEXT.tierStandard],
    ["key", POSITION_TEXT.tierKey],
    ["strategic", POSITION_TEXT.tierStrategic],
  ] as const;

  const strategic = next === "strategic";
  const c = Number(contact);
  const e = Number(exec);
  const ready =
    !strategic ||
    (Number.isInteger(c) &&
      c > 0 &&
      Number.isInteger(e) &&
      e > 0 &&
      period.trim() !== "");

  return (
    <Section
      icon="star"
      title={POSITION_TEXT.designate}
      description={POSITION_TEXT.designateWhy}
    >
      <div className="flex flex-wrap items-end gap-md">
        <Field>
          <FieldLabel>{POSITION_TEXT.designate}</FieldLabel>
          <NativeSelect
            value={next}
            onChange={(ev) => setNext(ev.target.value)}
          >
            {TIERS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {strategic ? (
          <>
            <Field>
              <FieldLabel>{POSITION_TEXT.planTarget}</FieldLabel>
              <Input
                type="number"
                min="0"
                value={target}
                onChange={(ev) => setTarget(ev.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{POSITION_TEXT.cadenceContact}</FieldLabel>
              <Input
                type="number"
                min="1"
                value={contact}
                onChange={(ev) => setContact(ev.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{POSITION_TEXT.cadenceExec}</FieldLabel>
              <Input
                type="number"
                min="1"
                value={exec}
                onChange={(ev) => setExec(ev.target.value)}
              />
            </Field>
          </>
        ) : null}

        <Button
          disabled={!ready || pending || next === tier}
          onClick={() =>
            start(() => {
              void onDesignate({
                accountId,
                tier: next,
                ...(strategic
                  ? {
                      plan: {
                        period,
                        targetAmount:
                          target.trim() === "" ? null : Number(target),
                        contactCadenceDays: c,
                        execCadenceDays: e,
                      },
                    }
                  : {}),
              }).then((r) => {
                setErr(
                  r.ok
                    ? null
                    : (ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? ""),
                );
                setDone(r.ok ? (r.tier ?? null) : null);
              });
            })
          }
        >
          {POSITION_TEXT.designateSubmit}
        </Button>

        {/* Said while they are choosing, not after they are refused. The rule
            will reject a plan-less strategic account either way; telling them
            first is the difference between a product that explains itself and
            one that argues. */}
        {strategic ? (
          <span className="text-muted-foreground text-xs">
            {POSITION_TEXT.planRequired}
          </span>
        ) : null}
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
        {done ? (
          <StatusBadge tone="success">
            {POSITION_TEXT.designated(
              TIERS.find(([k]) => k === done)?.[1] ?? done,
            )}
          </StatusBadge>
        ) : null}
      </div>
    </Section>
  );
}
