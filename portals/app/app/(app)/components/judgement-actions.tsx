"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { Urgency } from "../../domains/judgement/lib/judgement";

// 采纳 / 重新分析 / 忽略 on one judgement (owner 2026-09-26: 判断是 AI 已经做出
// 的分析，分析这一单是在它的基础上进一步分析；两者的结果都是工作的推进和处置).
//   采纳     - make it a dated 我方承诺 in 推进计划, in the person's words; the
//              judgement then leaves the list (handled).
//   重新分析 - hand exactly this judgement, with the deal, to the advisor.
//   忽略     - snooze it at its urgency (the home page's own 忽略).

export function JudgementActions({
  judgementId,
  urgency,
  claim,
  opportunityId,
  accountId,
  reanalyseHref,
  onAdopt,
  onDismiss,
}: {
  readonly judgementId: string;
  readonly urgency: Urgency;
  readonly claim: string;
  readonly opportunityId: string;
  readonly accountId: string;
  readonly reanalyseHref: string;
  readonly onAdopt: (input: {
    opportunityId: string;
    accountId: string;
    judgementId: string;
    urgency: Urgency;
    statement: string;
    dueOn: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onDismiss: (judgementId: string, urgency: Urgency) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { JUDGEMENT_ACTION_TEXT, JUDGEMENT_ADOPT_ERROR, DS_LABELS } = useMessages();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [pending, start] = useTransition();
  const fail = (code?: string): void => {
    toast({ tone: "danger", title: JUDGEMENT_ADOPT_ERROR[code ?? "unknown"] ?? JUDGEMENT_ADOPT_ERROR.unknown ?? code });
  };

  const openAdopt = () => {
    setStatement(JUDGEMENT_ACTION_TEXT.adoptDraft(claim));
    // A week out: a step with no date is not a step (the commitment needs one).
    setDueOn(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    setOpen(true);
  };
  const adopt = () =>
    start(async () => {
      const r = await onAdopt({ opportunityId, accountId, judgementId, urgency, statement, dueOn });
      if (!r.ok) return fail(r.error);
      setOpen(false);
      toast({ tone: "success", title: JUDGEMENT_ACTION_TEXT.adopted });
    });
  const dismiss = () =>
    start(async () => {
      const r = await onDismiss(judgementId, urgency);
      if (!r.ok) return fail(r.error);
      toast({ tone: "info", title: JUDGEMENT_ACTION_TEXT.ignored });
    });

  return (
    <>
      <Button size="xs" disabled={pending} onClick={openAdopt}>
        {JUDGEMENT_ACTION_TEXT.adopt}
      </Button>
      <Button size="xs" variant="outline" asChild>
        <Link href={reanalyseHref}>{JUDGEMENT_ACTION_TEXT.reanalyse}</Link>
      </Button>
      <Button size="xs" variant="ghost" disabled={pending} onClick={dismiss}>
        {JUDGEMENT_ACTION_TEXT.ignore}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{JUDGEMENT_ACTION_TEXT.adoptTitle}</DialogTitle>
            <DialogDescription>{JUDGEMENT_ACTION_TEXT.adoptHint}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-md">
            <Field>
              <FieldLabel htmlFor={`adopt-${judgementId}`}>{JUDGEMENT_ACTION_TEXT.statementLabel}</FieldLabel>
              <Input id={`adopt-${judgementId}`} value={statement} disabled={pending} onChange={(e) => setStatement(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`adopt-due-${judgementId}`}>{JUDGEMENT_ACTION_TEXT.dueLabel}</FieldLabel>
              <Input
                id={`adopt-due-${judgementId}`}
                type="date"
                className="max-w-[12rem]"
                value={dueOn}
                disabled={pending}
                onChange={(e) => setDueOn(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              {JUDGEMENT_ACTION_TEXT.cancel}
            </Button>
            <Button disabled={pending || !statement.trim() || !dueOn} onClick={adopt}>
              {pending ? DS_LABELS.confirmPending : JUDGEMENT_ACTION_TEXT.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
