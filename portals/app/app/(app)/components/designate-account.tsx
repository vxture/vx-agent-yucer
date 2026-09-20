"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Drawer,
  Field,
  FieldLabel,
  Input,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { TIER_ICON_SRC } from "./tag";
import type { AccountTier } from "../../domains/account/store";

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
    ["standard", POSITION_TEXT.tierStandard, POSITION_TEXT.tierStandardDesc],
    ["key", POSITION_TEXT.tierKey, POSITION_TEXT.tierKeyDesc],
    ["strategic", POSITION_TEXT.tierStrategic, POSITION_TEXT.tierStrategicDesc],
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
            {/* 三张奖牌卡, 不是下拉框 (owner, 2026-09-20: mockup - 企业定级需要
                金银铜奖牌的图形展示, 跟健康评估的图形一样重). TIER_ICON_SRC 是
                header 三维度那张"客户级别"徽标已经在用的同一份 PNG, 这里只是
                第二个消费者, 不是新画一套图。 */}
            <div className="gap-sm flex flex-col">
              {TIERS.map(([k, label, desc]) => (
                <button
                  key={k}
                  type="button"
                  disabled={pending}
                  onClick={() => setNext(k)}
                  className={`gap-sm border-border flex items-center rounded-md border-2 p-sm text-left ${
                    next === k ? "border-primary bg-primary-muted" : "bg-card"
                  }`}
                >
                  <img src={TIER_ICON_SRC[k as AccountTier]} alt="" className="h-[2.875rem] w-10 flex-none" />
                  <div className="min-w-0">
                    <div className="text-body-sm font-bold">{label}</div>
                    <div className="text-muted-foreground text-body-sm">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
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
