"use client";

import { AccountOperatingFields } from "./account-operating-fields";
import { operatingValues, operatingPlan, operatingError } from "../lib/account-plan-form";
import { useEffect, useState, useTransition } from "react";
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
import type { AccountTier, AccountPlanDraft } from "../../domains/account/store";

// The existing designation drawer also edits operating information without a
// tier change. Creation and association reuse the same domain fields and rule.

export interface DesignateAccountProps {
  readonly accountId: string;
  readonly tier: string;
  readonly period: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
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
  /** The customer's newest plan in any status; null = none yet. */
  readonly plan?: AccountPlanDraft & { readonly status: "active" | "closed"; readonly closeReason: string | null } | null;
  readonly onClosePlan?: (accountId: string, reason: string | null) => Promise<{ ok: boolean; error?: string }>;
  readonly onReopenPlan?: (accountId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function DesignateAccount({
  accountId,
  tier,
  period,
  open,
  onOpenChange,
  onDesignate,
  plan,
  onClosePlan,
  onReopenPlan,
}: DesignateAccountProps) {
  const { ACCOUNT_ERROR, DS_LABELS, POSITION_TEXT, ACCOUNT_OPERATING_TEXT } = useMessages();
  const [next, setNext] = useState<AccountTier>(tier as AccountTier);
  const [operating, setOperating] = useState(() => operatingValues(period, plan));
  const [closeReason, setCloseReason] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const TIERS = [
    ["standard", POSITION_TEXT.tierStandard, POSITION_TEXT.tierStandardDesc],
    ["key", POSITION_TEXT.tierKey, POSITION_TEXT.tierKeyDesc],
    ["strategic", POSITION_TEXT.tierStrategic, POSITION_TEXT.tierStrategicDesc],
  ] as const;

  // Reset to the current fact every time the drawer opens, same as the old
  // openDrawer() did on click - just triggered by the controlling prop now.
  useEffect(() => {
    if (!open) return;
    setNext(tier as AccountTier);
    setOperating(operatingValues(period, plan));
    setCloseReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runPlan = (op: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await op();
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error });
        return;
      }
      toast({ tone: "success", title: done });
      onOpenChange(false);
    });

  const submit = () =>
    start(async () => {
      const invalid = operatingError(next, operating);
      if (invalid) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[invalid] ?? ACCOUNT_ERROR.denied });
        return;
      }
      const r = await onDesignate({ accountId, tier: next, plan: operatingPlan(next, operating) });
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
      onOpenChange(false);
    });

  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width="sm"
      title={POSITION_TEXT.designate}
      description={POSITION_TEXT.designateWhy}
      closeLabel={DS_LABELS.confirmCancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {DS_LABELS.confirmCancel}
          </Button>
          <Button disabled={pending} onClick={submit}>
            {ACCOUNT_OPERATING_TEXT.save}
          </Button>
        </div>
      }
    >
      <div className="gap-lg flex flex-col">
          {plan && (onClosePlan || onReopenPlan) ? (
            <Field>
              <FieldLabel>{POSITION_TEXT.planTitle}</FieldLabel>
              <div className="gap-xs flex flex-col">
                <p className="text-body-small">
                  {plan.status === "active" ? POSITION_TEXT.planActive(plan.period) : POSITION_TEXT.planClosedAt(plan.period)}
                </p>
                {plan.status === "closed" && plan.closeReason ? (
                  <p className="text-muted-foreground text-body-small">{POSITION_TEXT.planReason(plan.closeReason)}</p>
                ) : null}
                {plan.status === "active" && onClosePlan ? (
                  <>
                    <Input
                      placeholder={POSITION_TEXT.planReasonLabel}
                      aria-label={POSITION_TEXT.planReasonLabel}
                      value={closeReason}
                      onChange={(ev) => setCloseReason(ev.target.value)}
                      disabled={pending}
                    />
                    <p className="text-muted-foreground text-body-small">{POSITION_TEXT.planCloseHint}</p>
                    <div>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          runPlan(
                            () => onClosePlan(accountId, closeReason.trim() === "" ? null : closeReason.trim()),
                            POSITION_TEXT.planClosed,
                          )
                        }
                      >
                        {POSITION_TEXT.planClose}
                      </Button>
                    </div>
                  </>
                ) : null}
                {plan.status === "closed" && onReopenPlan ? (
                  <div>
                    <Button variant="secondary" disabled={pending} onClick={() => runPlan(() => onReopenPlan(accountId), POSITION_TEXT.planReopened)}>
                      {POSITION_TEXT.planReopen}
                    </Button>
                  </div>
                ) : null}
              </div>
            </Field>
          ) : null}
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
                    <div className="text-body-small font-bold">{label}</div>
                    <div className="text-muted-foreground text-body-small">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Field>

          <AccountOperatingFields tier={next} values={operating} onChange={setOperating} disabled={pending} />
      </div>
    </Drawer>
  );
}
