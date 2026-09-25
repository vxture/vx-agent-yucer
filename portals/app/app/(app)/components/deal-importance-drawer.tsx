"use client";

import { useState, useTransition } from "react";
import { Button, Drawer, RadioGroup, RadioGroupItem, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useDealEditor } from "./deal-edit-context";

// 设定重要度 (incr/0090, deal batch 6). How much THIS deal matters to us - one
// of the deal axis's levels. Beside each, the priority it would give crossed
// with the customer's tier, so the choice is made seeing its consequence.
// No reason is asked: importance moves no rule, only the order work is read in.

export interface ImportanceOption {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** The matrix cell against this customer's tier; null = 未定级. */
  readonly priority: number | null;
}

export function DealImportanceDrawer({
  opportunityId,
  current,
  options,
  onSave,
}: {
  readonly opportunityId: string;
  readonly current: string | null;
  readonly options: readonly ImportanceOption[];
  readonly onSave: (opportunityId: string, levelId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const { DEAL_PAGE_TEXT, IMPORTANCE_ERROR, DS_LABELS } = useMessages();
  const { open, onOpenChange } = useDealEditor("importance");
  const { toast } = useToast();
  const [chosen, setChosen] = useState(current ?? "");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await onSave(opportunityId, chosen);
      if (!r.ok) {
        toast({ tone: "danger", title: IMPORTANCE_ERROR[r.error] ?? IMPORTANCE_ERROR.unknown ?? r.error });
        return;
      }
      toast({ tone: "success", title: DEAL_PAGE_TEXT.importanceSaved });
      onOpenChange(false);
    });
  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width="sm"
      title={DEAL_PAGE_TEXT.importanceEdit}
      description={DEAL_PAGE_TEXT.importanceDescription}
      footer={
        <div className="flex justify-end">
          <Button disabled={!chosen || chosen === current || pending} onClick={submit}>
            {pending ? DS_LABELS.confirmPending : DEAL_PAGE_TEXT.importanceConfirm}
          </Button>
        </div>
      }
    >
      <RadioGroup value={chosen} onValueChange={setChosen} className="gap-md flex flex-col">
        {options.map((o) => (
          <label className="gap-sm flex items-start" key={o.id} htmlFor={`importance-${o.id}`}>
            <RadioGroupItem id={`importance-${o.id}`} value={o.id} disabled={pending} className="mt-2xs" />
            <span className="gap-2xs flex flex-col">
              <span className="text-body-md font-semibold">
                {o.name}
                <span className="text-muted-foreground ml-xs text-body-sm font-normal">
                  {DEAL_PAGE_TEXT.importancePriority(o.priority)}
                </span>
              </span>
              {o.description ? <span className="text-muted-foreground text-body-sm">{o.description}</span> : null}
            </span>
          </label>
        ))}
      </RadioGroup>
    </Drawer>
  );
}
