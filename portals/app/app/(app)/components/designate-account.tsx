"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Drawer,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// Designating an account's tier, with the plan a strategic one requires.
//
// THE PLAN FIELDS APPEAR ONLY FOR `strategic`, and the rule layer refuses
// without them. That is not a form convenience: ADR-013's whole point is that
// the cadence rule is the ONLY rule that can fire for an account with no open
// deal, and it reads the plan. A strategic designation with no plan is a label
// on a customer that changes which rules run - to none.
//
// A HEADER BUTTON + DRAWER, not a permanently-open form on the display page
// (owner, 2026-09-09: display pages show, configuration lives behind one
// button - see market-scope-control.tsx for the same shape). The button
// states the current tier so the header answers "what is this account's tier"
// without opening anything; the Drawer, not a dialog, because a strategic
// choice grows a second step (the plan fields) the same way a province frame
// does.

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
  const { ACCOUNT_ERROR, DS_LABELS, POSITION_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState(tier);
  const [target, setTarget] = useState("");
  const [contact, setContact] = useState("30");
  const [exec, setExec] = useState("90");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  if (!canWrite) return null;

  const TIERS = [
    ["standard", POSITION_TEXT.tierStandard],
    ["key", POSITION_TEXT.tierKey],
    ["strategic", POSITION_TEXT.tierStrategic],
  ] as const;
  const currentLabel = TIERS.find(([k]) => k === tier)?.[1] ?? tier;

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

  const openDrawer = () => {
    setNext(tier);
    setTarget("");
    setContact("30");
    setExec("90");
    setOpen(true);
  };

  const submit = () =>
    start(async () => {
      const r = await onDesignate({
        accountId,
        tier: next,
        ...(strategic
          ? {
              plan: {
                period,
                targetAmount: target.trim() === "" ? null : Number(target),
                contactCadenceDays: c,
                execCadenceDays: e,
              },
            }
          : {}),
      });
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error });
        return;
      }
      toast({
        tone: "success",
        title: POSITION_TEXT.designated(
          TIERS.find(([k]) => k === (r.tier ?? next))?.[1] ?? r.tier ?? next,
        ),
      });
      setOpen(false);
    });

  return (
    <>
      <Button variant="secondary" onClick={openDrawer}>
        {POSITION_TEXT.designateButton(currentLabel)}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        title={POSITION_TEXT.designate}
        description={POSITION_TEXT.designateWhy}
        closeLabel={DS_LABELS.confirmCancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              {DS_LABELS.confirmCancel}
            </Button>
            <Button disabled={!ready || pending || next === tier} onClick={submit}>
              {POSITION_TEXT.designateSubmit}
            </Button>
          </div>
        }
      >
        <div className="gap-lg flex flex-col">
          <Field>
            <FieldLabel>{POSITION_TEXT.designate}</FieldLabel>
            <NativeSelect value={next} onChange={(ev) => setNext(ev.target.value)} disabled={pending}>
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
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel>{POSITION_TEXT.cadenceContact}</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={contact}
                  onChange={(ev) => setContact(ev.target.value)}
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel>{POSITION_TEXT.cadenceExec}</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={exec}
                  onChange={(ev) => setExec(ev.target.value)}
                  disabled={pending}
                />
              </Field>
              {/* Said while they are choosing, not after they are refused. The
                  rule will reject a plan-less strategic account either way;
                  telling them first is the difference between a product that
                  explains itself and one that argues. */}
              <p className="text-muted-foreground text-body-sm">{POSITION_TEXT.planRequired}</p>
            </>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
