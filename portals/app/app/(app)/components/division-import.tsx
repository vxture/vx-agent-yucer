"use client";

import { useState } from "react";
import {
  Banner,
  Button,
  ConfirmDestructive,
  DialogForm,
  RadioGroup,
  RadioGroupItem,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { importTemplate } from "../admin/division/actions";

/* 应用模版 (owner, 2026-09-11: 重置预置改名应用模版) - adopt a shipped carve
 * wholesale.
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
 *
 * TWO STEPS, THE SECOND DESTRUCTIVE (owner, 2026-09-09: 配置首页的重置预置也
 * 需要危险确认，并提示危险性). The dialog is where the carve is CHOSEN, with a
 * danger banner stating what adopting it costs; 确认替换 then opens the DS's
 * destructive confirmation - verb, target, consequence - and only that lands
 * the change. Choosing and destroying are two different clicks.
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
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [chosen, setChosen] = useState(templates[0]?.key ?? "");
  const { toast } = useToast();
  const picked = templates.find((t) => t.key === chosen) ?? null;

  /* The hammer. A refusal is shown as a toast and RE-THROWN, so the DS keeps
     the confirmation open: the person must see that the click did not land. */
  const run = async () => {
    const r = await importTemplate(chosen);
    if (!r.ok) {
      toast({ tone: "danger", title: TERRITORY_ERROR[r.error] ?? r.error });
      throw new Error(r.error);
    }
    setConfirming(false);
    setOpen(false);
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
             service refuses (template_unknown). */
          setChosen(templates[0]?.key ?? "");
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
        /* OURS, not the DS default - which renders "Working..." and put an
           English word in the middle of a Chinese dialog the moment the button
           was pressed. Same rule as every other DS label this product passes
           through DS_LABELS. */
        pendingLabel={DS_LABELS.confirmPending}
        submitDisabled={chosen === ""}
        /* DESTRUCTIVE, and typed as such: it discards divisions the tenant may
           have carved by hand. The red button is the banner below stated in
           the shape of the control; pressing it asks once more. */
        danger
        onSubmit={(e) => {
          e.preventDefault();
          setConfirming(true);
        }}
      >
        <div className="gap-md flex flex-col">
          {/* THE DS'S RADIO, not a bare <input> (the repo's one UI rule), and
              each label bound to its control by id so a screen reader and a
              click on the text both land on the right carve. */}
          <RadioGroup value={chosen} onValueChange={setChosen} className="gap-md flex flex-col">
            {templates.map((t) => (
              <label className="gap-sm flex items-start" key={t.key} htmlFor={`carve-${t.key}`}>
                <RadioGroupItem id={`carve-${t.key}`} value={t.key} className="mt-2xs" />
                <span className="gap-2xs flex flex-col">
                  <span className="text-body-md font-semibold">{t.label}</span>
                  <span className="text-muted-foreground text-body-sm">{t.names.join(" / ")}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {/* THE DANGER, AS THE DS DRAWS IT - not a line of coloured text. */}
          <Banner
            tone="danger"
            title={PLANNING_TEXT.templateDangerTitle}
            description={PLANNING_TEXT.templateReplaceWarn(currentDivisions, customCount)}
          />
        </div>
      </DialogForm>
      <ConfirmDestructive
        open={confirming}
        onOpenChange={setConfirming}
        verb={PLANNING_TEXT.templateConfirmVerb}
        target={PLANNING_TEXT.templateConfirmTarget(picked?.label ?? "")}
        consequence={PLANNING_TEXT.templateConsequence(currentDivisions, customCount)}
        titleTemplate={PLANNING_TEXT.destructiveTitle}
        cancelLabel={PLANNING_TEXT.templateCancel}
        pendingLabel={DS_LABELS.confirmPending}
        onConfirm={run}
      />
    </>
  );
}
