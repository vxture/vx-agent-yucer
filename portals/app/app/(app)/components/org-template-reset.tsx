"use client";

import { useState } from "react";
import { Banner, Button, ConfirmDestructive, DialogForm, RadioGroup, RadioGroupItem, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { applyOrgTemplateAction } from "../admin/org/actions";
import { Tag } from "./tag";

/* 应用模版 (owner, 2026-09-11: 重置预置改名应用模版) - replace the
 * organisation with a shipped template.
 *
 * THREE TEMPLATES ARE SHIPPED (owner, 2026-09-10: 集团型大公司 / 中规模全国组织 /
 * 小规模简单团队), and a workspace starts on the middle one. None is more
 * correct: a group picks the five-level one and renames; a twelve-person
 * company picks the two-level one.
 *
 * IT REPLACES, and says so in this workspace's numbers: how many units go,
 * how many members lose their placement. TWO STEPS, THE SECOND DESTRUCTIVE,
 * as every reset here: choose in the dialog under a danger banner; 确认替换
 * opens the DS's confirmation, and only that lands the change.
 */
export interface OrgTemplateOption {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly isDefault: boolean;
  readonly units: number;
}

export function OrgTemplateReset({ templates, currentUnits, placed }: {
  readonly templates: readonly OrgTemplateOption[];
  readonly currentUnits: number;
  /** Members placed somewhere in the current tree - every one is un-placed. */
  readonly placed: number;
}) {
  const { DS_LABELS, ORG_ERROR, ORG_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [chosen, setChosen] = useState(templates.find((t) => t.isDefault)?.key ?? templates[0]?.key ?? "");
  const { toast } = useToast();
  const router = useRouter();
  const picked = templates.find((t) => t.key === chosen) ?? null;

  const run = async () => {
    const r = await applyOrgTemplateAction(chosen);
    if (!r.ok) {
      toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
      throw new Error(r.error);
    }
    toast({ tone: "success", title: ORG_TEXT.templateDone(r.units, r.unplaced, r.detached) });
    setConfirming(false);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="secondary" disabled={templates.length === 0} onClick={() => setOpen(true)}>
        {ORG_TEXT.templateReset}
      </Button>
      <DialogForm
        open={open}
        onOpenChange={setOpen}
        title={ORG_TEXT.templateTitle}
        description={ORG_TEXT.templateWhy}
        submitLabel={ORG_TEXT.templateConfirm}
        cancelLabel={ORG_TEXT.cancel}
        pendingLabel={DS_LABELS.confirmPending}
        submitDisabled={chosen === ""}
        danger
        onSubmit={(e) => {
          e.preventDefault();
          setConfirming(true);
        }}
      >
        <div className="gap-md flex flex-col">
          <RadioGroup value={chosen} onValueChange={setChosen} className="gap-md flex flex-col">
            {templates.map((t) => (
              <label className="gap-sm flex items-start" key={t.key} htmlFor={`org-template-${t.key}`}>
                <RadioGroupItem id={`org-template-${t.key}`} value={t.key} className="mt-2xs" />
                <span className="gap-2xs flex flex-col">
                  <span className="gap-xs flex items-center">
                    <span className="text-body-md font-semibold">{ORG_TEXT.templateOption(t.name, t.units)}</span>
                    {t.isDefault ? <Tag>{ORG_TEXT.templateDefault}</Tag> : null}
                  </span>
                  <span className="text-muted-foreground text-body-sm">{t.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <Banner
            tone={currentUnits === 0 ? "info" : "danger"}
            title={currentUnits === 0 ? ORG_TEXT.templateTitle : ORG_TEXT.templateDangerTitle}
            description={ORG_TEXT.templateWarn(currentUnits, placed)}
          />
        </div>
      </DialogForm>
      <ConfirmDestructive
        open={confirming}
        onOpenChange={setConfirming}
        verb={ORG_TEXT.templateVerb}
        target={ORG_TEXT.templateTarget(picked?.name ?? "")}
        consequence={ORG_TEXT.templateWarn(currentUnits, placed)}
        titleTemplate={ORG_TEXT.destructiveTitle}
        cancelLabel={ORG_TEXT.cancel}
        pendingLabel={DS_LABELS.confirmPending}
        onConfirm={run}
      />
    </>
  );
}
