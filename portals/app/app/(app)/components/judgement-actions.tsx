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
import { LIGHT_BUTTON } from "./action-card";
import type { Urgency } from "../../domains/judgement/lib/judgement";

// The buttons of one 研判与行动 item (owner 2026-09-26: 按钮轻量化，保留一个
// primary，其他淡化):
//   primary   - 去处理 to where the work is done, or - when the item has no
//               place of its own - 加入计划 itself.
//   light     - 加入计划 (a dated 我方承诺 in 推进计划, in the person's
//               words; a judgement then leaves the list, handled),
//               问参谋 (this item and the deal, to the advisor),
//               忽略 (judgements only: the existing snooze).

export function JudgementActions({
  judgementId = null,
  urgency = null,
  draft,
  opportunityId,
  accountId,
  primaryHref = null,
  askHref,
  onAdopt,
  onDismiss,
}: {
  readonly judgementId?: string | null;
  readonly urgency?: Urgency | null;
  /** The step as first written - the conclusion. */
  readonly draft: string;
  readonly opportunityId: string;
  readonly accountId: string;
  /** Where 去处理 goes; null makes 加入计划 the primary. */
  readonly primaryHref?: string | null;
  readonly askHref: string;
  readonly onAdopt: (input: {
    opportunityId: string;
    accountId: string;
    judgementId?: string | null;
    urgency?: Urgency | null;
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
    setStatement(draft);
    // A week out: a step with no date is not a step (the commitment needs one).
    setDueOn(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    setOpen(true);
  };
  const adopt = () =>
    start(async () => {
      const r = await onAdopt({ opportunityId, accountId, judgementId, urgency, statement, dueOn });
      if (!r.ok) {
        fail(r.error);
        return;
      }
      setOpen(false);
      toast({ tone: "success", title: JUDGEMENT_ACTION_TEXT.adopted });
    });
  const dismiss = () =>
    start(async () => {
      if (!judgementId || !urgency) return;
      const r = await onDismiss(judgementId, urgency);
      if (!r.ok) {
        fail(r.error);
        return;
      }
      toast({ tone: "info", title: JUDGEMENT_ACTION_TEXT.ignored });
    });

  return (
    <>
      {primaryHref ? (
        <Button size="xs" asChild>
          <Link href={primaryHref}>{JUDGEMENT_ACTION_TEXT.go}</Link>
        </Button>
      ) : (
        <Button size="xs" disabled={pending} onClick={openAdopt}>
          {JUDGEMENT_ACTION_TEXT.toPlan}
        </Button>
      )}
      {primaryHref ? (
        <Button size="xs" variant="ghost" className={LIGHT_BUTTON} disabled={pending} onClick={openAdopt}>
          {JUDGEMENT_ACTION_TEXT.toPlan}
        </Button>
      ) : null}
      <Button size="xs" variant="ghost" className={LIGHT_BUTTON} asChild>
        <Link href={askHref}>{JUDGEMENT_ACTION_TEXT.ask}</Link>
      </Button>
      {judgementId ? (
        <Button size="xs" variant="ghost" className={LIGHT_BUTTON} disabled={pending} onClick={dismiss}>
          {JUDGEMENT_ACTION_TEXT.ignore}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{JUDGEMENT_ACTION_TEXT.adoptTitle}</DialogTitle>
            <DialogDescription>{JUDGEMENT_ACTION_TEXT.adoptHint}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-md">
            <Field>
              <FieldLabel htmlFor={`adopt-${draft}`}>{JUDGEMENT_ACTION_TEXT.statementLabel}</FieldLabel>
              <Input id={`adopt-${draft}`} value={statement} disabled={pending} onChange={(e) => setStatement(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`adopt-due-${draft}`}>{JUDGEMENT_ACTION_TEXT.dueLabel}</FieldLabel>
              <Input
                id={`adopt-due-${draft}`}
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
