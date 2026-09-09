"use client";

import { useState, useTransition } from "react";
import { Button, DialogForm } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { importTemplate } from "../admin/division/actions";

/* 重置预置 - adopt a shipped carve wholesale.
 *
 * BESIDE 新建, NOT IN A SECTION OF ITS OWN (owner, 2026-09-08). It was a panel
 * below the roster, which read as a third thing the page is about; it is one
 * action on the same footing as "add a division", and belongs in the same row.
 *
 * TWO CARVES ARE SHIPPED and neither is more correct: the five-way 东南西北中
 * and the seven-way 华北/东北/华东/华中/华南/西南/西北. A workspace starts on one
 * and edits from there; nothing here treats either as the shape of the world.
 *
 * IT REPLACES, and says so before doing it. Both carves place all 34 provinces,
 * so adopting one is a statement about the whole market - and a workspace that
 * has already customised is told exactly how many of its own divisions the
 * reset would discard, in its own numbers rather than as "are you sure".
 */
export interface TemplateOption {
  readonly key: string;
  readonly label: string;
  readonly divisions: number;
  /** The division names, so the choice can be read before it is taken. */
  readonly names: readonly string[];
}

export function DivisionImport(
  { templates, currentDivisions, customCount }:
  {
    readonly templates: readonly TemplateOption[];
    readonly currentDivisions: number;
    /** How many of the current divisions are the tenant's own work. */
    readonly customCount: number;
  },
) {
  const { DS_LABELS, PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(templates[0]?.key ?? "");

  const run = () => {
    setError(null);
    start(async () => {
      const r = await importTemplate(chosen);
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      else setOpen(false);
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          /* RE-READ THE LIST ON OPEN. The frame can change while this button
             is mounted (the drawer beside it does exactly that), and the
             carves offered under 陕西 are not the ones offered under 中国市场:
             a choice remembered from the old list would submit a key the
             service refuses (template_scope_mismatch). */
          setChosen(templates[0]?.key ?? "");
          setError(null);
          setOpen(true);
        }}
      >
        {PLANNING_TEXT.templateReset}
      </Button>
      <DialogForm
        open={open}
        onOpenChange={setOpen}
        title={PLANNING_TEXT.templateTitle}
        description={PLANNING_TEXT.templateWhy}
        submitLabel={PLANNING_TEXT.templateConfirm}
        cancelLabel={PLANNING_TEXT.templateCancel}
        submitting={pending}
        /* OURS, not the DS default - which renders "Working..." and put an
           English word in the middle of a Chinese dialog the moment the button
           was pressed. Same rule as every other DS label this product passes
           through DS_LABELS. */
        pendingLabel={DS_LABELS.confirmPending}
        submitDisabled={chosen === ""}
        /* DESTRUCTIVE, and typed as such: it discards divisions the tenant may
           have carved by hand. The red button is the warning below stated in
           the shape of the control. */
        danger
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="gap-md flex flex-col">
          {error ? <p className="text-destructive text-body-sm" role="alert">{error}</p> : null}
          {templates.map((t) => (
            <label className="gap-sm flex items-start" key={t.key}>
              <input
                type="radio"
                name="division-template"
                className="mt-2xs"
                checked={chosen === t.key}
                onChange={() => setChosen(t.key)}
                disabled={pending}
              />
              <span className="gap-2xs flex flex-col">
                <span className="text-body font-semibold">{t.label}</span>
                <span className="text-muted-foreground text-body-sm">{t.names.join(" / ")}</span>
              </span>
            </label>
          ))}
          <p className="text-warning text-body-sm">
            {PLANNING_TEXT.templateReplaceWarn(currentDivisions, customCount)}
          </p>
        </div>
      </DialogForm>
    </>
  );
}
