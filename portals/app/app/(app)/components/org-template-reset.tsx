"use client";

import { useState } from "react";
import { Banner, Button, Checkbox, ConfirmDestructive, DialogForm, RadioGroup, RadioGroupItem, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { applyStartupTemplateAction } from "../admin/org/actions";
import { Tag } from "./tag";

/* 应用模版 (owner, 2026-09-11: 重置预置改名应用模版) - replace the
 * organisation with a shipped template, and (面板优化, 2026-09-11: 用户选择
 * 五分区/七分区，同步在区域设置应用对应模版；用户勾选机构自动关联大区)
 * optionally the region carve and the territory-to-unit links that go with
 * it, in one dialog and one confirm.
 *
 * THREE ORG TEMPLATES ARE SHIPPED (owner, 2026-09-10: 集团型大公司 / 中规模
 * 全国组织 / 小规模简单团队), unchanged by this round, and a workspace
 * starts on the middle one. TWO REGION CARVES ARE SHIPPED (五分法/七分法,
 * from /admin/division's own template list) - PICKING ONE IS OPTIONAL
 * (不同步 leaves 区域设置 alone, today's behaviour) BECAUSE APPLYING AN ORG
 * TEMPLATE NEVER USED TO TOUCH IT, and nothing here should surprise a reader
 * who only wanted the org tree replaced.
 *
 * THE ORDER (applyStartupTemplateAction, org/actions.ts): org template first
 * (units must exist before anything can link to one), region carve second
 * (a territory must have a 大区 to cover before it can exist), one new
 * territory per 大区 last, named the same, 自动关联 optionally matching it
 * to a same-named unit - see that action's own comment for why this is
 * three domain calls with no shared transaction, not one.
 *
 * TWO STEPS, THE SECOND DESTRUCTIVE, as every reset here: choose in the
 * dialog under a danger banner; 确认替换 opens the DS's confirmation, and
 * only that lands the change.
 */
export interface OrgTemplateOption {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly isDefault: boolean;
  readonly units: number;
}

export interface DivisionTemplateOption {
  readonly key: string;
  readonly name: string;
  readonly divisions: number;
}

export function OrgTemplateReset({ templates, currentUnits, placed, divisionTemplates, currentDivisions }: {
  readonly templates: readonly OrgTemplateOption[];
  readonly currentUnits: number;
  /** Members placed somewhere in the current tree - every one is un-placed. */
  readonly placed: number;
  readonly divisionTemplates: readonly DivisionTemplateOption[];
  /** 大区 rows /admin/division already has - what a division sync would replace. */
  readonly currentDivisions: number;
}) {
  const { DS_LABELS, ORG_ERROR, ORG_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [chosen, setChosen] = useState(templates.find((t) => t.isDefault)?.key ?? templates[0]?.key ?? "");
  /** "" = 不同步 - the default, today's behaviour: applying an org template
   *  never used to touch 区域设置. */
  const [divisionChosen, setDivisionChosen] = useState("");
  const [autoAssociate, setAutoAssociate] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const picked = templates.find((t) => t.key === chosen) ?? null;
  const pickedDivision = divisionTemplates.find((t) => t.key === divisionChosen) ?? null;

  const run = async () => {
    const r = await applyStartupTemplateAction({
      orgKey: chosen,
      divisionKey: divisionChosen || null,
      autoAssociate: divisionChosen !== "" && autoAssociate,
    });
    if (!r.ok) {
      toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
      throw new Error(r.error);
    }
    toast({ tone: "success", title: ORG_TEXT.templateDone(r.units, r.unplaced, r.detached, r.divisions, r.territories, r.linkedUnits) });
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
        size="xl"
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
        <div className="gap-lg flex flex-col">
          <div className="gap-sm flex flex-col">
            <span className="text-label-md text-foreground font-semibold">{ORG_TEXT.templateOrgLabel}</span>
            {/* 三选一，描述句偏长 (owner, 2026-09-10: 每套模版的说明), 一行放
                不下 - 这一组仍然纵向排，横向铺的是下面短得多的区域选项。 */}
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
          </div>
          {divisionTemplates.length > 0 ? (
            <div className="gap-sm flex flex-col">
              <span className="text-label-md text-foreground font-semibold">{ORG_TEXT.templateDivisionLabel}</span>
              <span className="text-muted-foreground text-body-sm">{ORG_TEXT.templateDivisionWhy}</span>
              {/* 横线铺开 (owner, 2026-09-11: 把大区设置选项横线铺开) - 每个
                  选项就是一个名字加个数，短，面板加宽后一行放得下。 */}
              <RadioGroup value={divisionChosen} onValueChange={setDivisionChosen} className="gap-sm flex flex-row flex-wrap">
                <label
                  className="gap-sm border-border has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-muted flex items-center rounded-lg border px-md py-sm"
                  htmlFor="division-template-none"
                >
                  <RadioGroupItem id="division-template-none" value="" />
                  <span className="text-body-md">{ORG_TEXT.templateDivisionNone}</span>
                </label>
                {divisionTemplates.map((t) => (
                  <label
                    className="gap-sm border-border has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-muted flex items-center rounded-lg border px-md py-sm"
                    key={t.key}
                    htmlFor={`division-template-${t.key}`}
                  >
                    <RadioGroupItem id={`division-template-${t.key}`} value={t.key} />
                    <span className="text-body-md">{ORG_TEXT.templateDivisionOption(t.name, t.divisions)}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          ) : null}
          {divisionTemplates.length > 0 ? (
            /* 关联选项作为第三个标题 (owner, 2026-09-11: 把关联选项作为第三
               个标题) - 从区域设置模版底下升成自己一节，跟前两节同一个层级；
               仍然靠区域设置模版是否选了"不同步"来决定能不能勾 - 没有新建的
               销售区域，没有什么可关联的。 */
            <div className="gap-sm flex flex-col">
              <span className="text-label-md text-foreground font-semibold">{ORG_TEXT.templateAssociateLabel}</span>
              <label className="gap-sm flex items-start">
                <Checkbox
                  checked={autoAssociate}
                  onCheckedChange={(v) => setAutoAssociate(v === true)}
                  disabled={divisionChosen === ""}
                  className="mt-2xs"
                />
                <span className="gap-2xs flex flex-col">
                  <span className="text-body-md">{ORG_TEXT.templateAutoAssociate}</span>
                  <span className="text-muted-foreground text-body-sm">
                    {divisionChosen === "" ? ORG_TEXT.templateAutoAssociateDisabled : ORG_TEXT.templateAutoAssociateHint}
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          <Banner
            tone={currentUnits === 0 && !pickedDivision ? "info" : "danger"}
            title={currentUnits === 0 && !pickedDivision ? ORG_TEXT.templateTitle : ORG_TEXT.templateDangerTitle}
            description={ORG_TEXT.templateWarn(currentUnits, placed, pickedDivision?.name ?? null, currentDivisions)}
          />
        </div>
      </DialogForm>
      <ConfirmDestructive
        open={confirming}
        onOpenChange={setConfirming}
        verb={ORG_TEXT.templateVerb}
        target={ORG_TEXT.templateTarget(picked?.name ?? "", pickedDivision?.name ?? null)}
        consequence={ORG_TEXT.templateWarn(currentUnits, placed, pickedDivision?.name ?? null, currentDivisions)}
        titleTemplate={ORG_TEXT.destructiveTitle}
        cancelLabel={ORG_TEXT.cancel}
        pendingLabel={DS_LABELS.confirmPending}
        onConfirm={run}
      />
    </>
  );
}
