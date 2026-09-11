"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  Drawer,
  Field,
  FieldDescription,
  FieldLabel,
  Icon,
  Input,
  NativeSelect,
  Section,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { removeOrgUnitAction, saveOrgUnitAction, setUnitDivisionsAction } from "../admin/org/actions";
import { FormActions, FormFields, FormPage } from "./form-page";
import { Tag } from "./tag";

/* 配置单位 - THE ONE FORM a unit is created and edited on (incr/0051).
 *
 * FIVE QUESTIONS: where it hangs (上级单位), what it is (单位类型, with 配置
 * beside it because the list is the workspace's and the form is where
 * somebody finds out it is one short), its code (the anchor, editable only
 * while creating), its name, and who leads it (one of the members).
 *
 * THE PARENT LIST EXCLUDES THE UNIT AND EVERYTHING UNDER IT - the page
 * computes that - so a cycle cannot be chosen, only refused as a defence.
 *
 * THE WAY OUT: 保存单位 · 放弃 · 删除单位, the last offered only when nothing
 * stands under it (the FK's RESTRICT shown rather than hit) and confirmed
 * with how many members it would un-place.
 */

export interface UnitOption {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
}
export interface KindOption {
  readonly id: string;
  readonly name: string;
}
export interface LeaderOption {
  readonly sub: string;
  readonly name: string;
}

/* 关联区域 (incr/0055, owner 2026-09-11: 组织到大区应该直连，不绕销售
 * 区域一跳 - 抽屉挂的是销售区域，跟区域设置的大区对不上) - EDIT ONLY: a
 * brand-new unit has no id yet to link a 大区 to, save it first. ONE REAL
 * CHOICE, not four: 选择区域 (a side Drawer) ticks which 大区 this unit is
 * linked to DIRECTLY - the only thing that actually writes anything. Left
 * unset, the section shows a READ-ONLY PREVIEW of what 按组织 data-scope
 * already computes automatically from the unit's tree position - 向下聚合
 * (its own subtree's direct links) or 向上继承 (the nearest ancestor's,
 * once its own subtree has none) - via effectiveTerritoryIds (org.ts,
 * generic over any `{id, unitIds}` shape, reused here unchanged for
 * divisions rather than territories - see admin/org/[id]/page.tsx).
 *
 * 组织架构表格自己的「区域」列仍然显示销售区域范围，不是这里 (owner 已经把
 * 那一块 - 成员数据范围/resolve-scope.ts - 划为后续彻底撤销销售区域时才动
 * 的范围，这一批不碰)。两处暂时说的是两件事，销售区域整体撤销时会收敛。
 */
export type DivisionScope = "none" | "partial" | "full" | "inherited";
export interface DivisionOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

export function OrgUnitForm({
  isNew,
  id,
  unitCode,
  name,
  parentId,
  kindId,
  leaderSub,
  parents,
  kinds,
  leaders,
  children,
  members,
  divisionOptions,
  directDivisionIds,
  scope,
  effectiveDivisionNames,
}: {
  readonly isNew: boolean;
  readonly id: string | null;
  readonly unitCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly kindId: string | null;
  readonly leaderSub: string | null;
  /** The units this one may hang under, in tree order - never itself or its subtree. */
  readonly parents: readonly UnitOption[];
  readonly kinds: readonly KindOption[];
  readonly leaders: readonly LeaderOption[];
  /** Units under this one - delete is offered only at zero. */
  readonly children: number;
  /** Members placed here - what a delete would un-place. */
  readonly members: number;
  /** Every 大区 this workspace has - the 选择区域 drawer's checklist.
   *  Unused (and the whole section hidden) while `isNew`. */
  readonly divisionOptions: readonly DivisionOption[];
  /** 大区 THIS unit is linked to directly right now - what the drawer opens
   *  pre-ticked to and what the COLLAPSED section renders as chips. A
   *  direct FK, so nothing here can go stale the way a territory's regions
   *  once could - no separate "live" filter needed. */
  readonly directDivisionIds: readonly string[];
  /** The EFFECTIVE outcome if nothing more is ticked - computed server-side
   *  by the same function the org-structure table and resolve-scope.ts use,
   *  called with 大区 links instead of territory links. */
  readonly scope: DivisionScope;
  /** The 大区 向下聚合/向上继承 actually resolves to right now (owner,
   *  2026-09-11: 设定向下聚合，向上继承，不能一直显示为无范围 - 应该显示
   *  聚合或继承结果：范围名称 或 无范围) - the real names, not just the
   *  badge word, so setting one of those two modes shows what it actually
   *  covers rather than a generic label that reads the same regardless of
   *  outcome. Empty (and always, while `isNew`) falls to 无范围. */
  readonly effectiveDivisionNames: readonly string[];
}) {
  const { ORG_ERROR, ORG_TEXT } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState(unitCode);
  const [nameValue, setNameValue] = useState(name);
  const [parentValue, setParentValue] = useState(parentId ?? "");
  const [kindValue, setKindValue] = useState(kindId ?? "");
  const [leaderValue, setLeaderValue] = useState(leaderSub ?? "");
  const [divisionDrawerOpen, setDivisionDrawerOpen] = useState(false);
  const [divisionSelection, setDivisionSelection] = useState<readonly string[]>(directDivisionIds);
  const [divisionPending, startDivision] = useTransition();
  /* 关联区域模式 (owner, 2026-09-11: 右侧四个按钮 - 向下聚合/向上继承/选择
     区域/无区域) - underneath, there are really only two states (a direct
     pick, or not), and `manualIntent` is that switch. The other two button
     labels are DISPLAY of what the tree already resolves automatically
     (same `scope`/`directDivisionIds` the collapsed chips used before this
     button row existed) - picking either just means "give up the direct
     pick", so the label re-syncs to whichever is actually true once the
     write lands, regardless of which one the admin happened to click. */
  const [manualIntent, setManualIntent] = useState(
    isNew ? divisionSelection.length > 0 : directDivisionIds.length > 0,
  );
  type DivisionMode = "aggregate" | "inherited" | "manual" | "none";
  const divisionMode: DivisionMode = manualIntent
    ? "manual"
    : scope === "full" || scope === "partial"
      ? "aggregate"
      : scope === "inherited"
        ? "inherited"
        : "none";
  /** What the content area lists as chips - the pending pick while new, the
   *  direct links while editing. Empty falls to the badge word for
   *  whichever of aggregate/inherited/none is actually true. */
  const chips = isNew ? divisionSelection : directDivisionIds;
  /* 内容区空时显示请选择 (owner, 2026-09-11) - EDIT always has a real
     answer already (the server computed `scope` before this form ever
     rendered), so it starts chosen. NEW starts unchosen until the admin
     actually clicks one of the buttons - before that there is nothing to
     show a badge word FOR, so 请选择 stands in rather than defaulting to
     无区域 as if that had been decided. */
  const [chosen, setChosen] = useState(!isNew || divisionSelection.length > 0);

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveOrgUnitAction({
        unitCode: codeValue.trim(),
        name: nameValue.trim(),
        parentId: parentValue === "" ? null : parentValue,
        kindId: kindValue,
        leaderSub: leaderValue === "" ? null : leaderValue,
      });
      if (!r.ok) {
        setError(ORG_ERROR[r.error] ?? r.error);
        return;
      }
      // 组织与大区关联设置 (owner, 2026-09-11) - a brand-new unit has no id
      // until THIS save succeeds, so 选择区域 could only hold the pick
      // locally; apply it now that the unit is real. The unit itself is
      // already created - a failure here is reported but does not block
      // leaving, or a working unit would be stuck behind a retry loop for a
      // step that has its own fix (open 选择区域 again from 单位配置).
      if (isNew && divisionSelection.length > 0) {
        const t = await setUnitDivisionsAction(r.id, divisionSelection);
        if (!t.ok) toast({ tone: "danger", title: ORG_ERROR[t.error] ?? t.error });
      }
      router.push("/admin/org");
    });
  };
  const remove = () => {
    if (!id) return;
    setError(null);
    start(async () => {
      const r = await removeOrgUnitAction(id);
      if (!r.ok) setError(ORG_ERROR[r.error] ?? r.error);
      else router.push("/admin/org");
    });
  };

  /* 选择区域 - EDIT opens pre-ticked to what is ALREADY directly linked (the
     server's truth, discarding any unsaved in-drawer change from a prior
     open-then-cancel). NEW has no server truth yet - the selection IS the
     local state, held across opens so re-opening the drawer does not lose
     what was already picked before the unit is saved. */
  const openDivisionDrawer = () => {
    if (!isNew) setDivisionSelection(directDivisionIds);
    setDivisionDrawerOpen(true);
  };
  /* 选择区域 (原手动选择改名，owner 2026-09-11: 放第一个) - one click now
     both commits to the manual mode AND opens the drawer; there is no more
     intermediate "手动选择 reveals a second 选择区域 button" step. */
  const chooseManualDivision = () => {
    setChosen(true);
    setManualIntent(true);
    openDivisionDrawer();
  };
  const toggleDivision = (divisionId: string) =>
    setDivisionSelection((prev) => (prev.includes(divisionId) ? prev.filter((d) => d !== divisionId) : [...prev, divisionId]));
  /* NEW: nothing to write yet - 保存单位 applies `divisionSelection` once
     the unit has an id (see submit() above). EDIT: writes immediately,
     matching every other field on this form reading "保存" as "commit now". */
  const saveDivisions = () => {
    if (isNew) {
      setDivisionDrawerOpen(false);
      return;
    }
    if (!id) return;
    startDivision(async () => {
      const r = await setUnitDivisionsAction(id, divisionSelection);
      if (!r.ok) {
        toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
        return;
      }
      toast({ tone: "success", title: ORG_TEXT.formDivisionDone });
      setDivisionDrawerOpen(false);
      router.refresh();
    });
  };
  /* Picking one of the two non-manual buttons (选择区域 has its own
     handler, chooseManualDivision, above). Each gives up a direct link
     that may not exist yet, in which case there is nothing to write and
     this is a no-op past the flag. Either also settles `chosen` - 请选择
     is only for BEFORE a button has been clicked at all. */
  const chooseDivisionMode = (mode: Exclude<DivisionMode, "manual">) => {
    setChosen(true);
    setManualIntent(false);
    if (divisionSelection.length === 0 && directDivisionIds.length === 0) return;
    if (isNew) {
      setDivisionSelection([]);
      return;
    }
    if (!id) return;
    startDivision(async () => {
      const r = await setUnitDivisionsAction(id, []);
      if (!r.ok) {
        toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
        return;
      }
      setDivisionSelection([]);
      toast({ tone: "success", title: ORG_TEXT.formDivisionDone });
      router.refresh();
    });
  };

  /* FormPage - THE SHAPE EVERY DEDICATED FORM PAGE SHARES (owner ruling,
     2026-09-05, form-page.tsx). No `assist`: there is nothing this form has
     to suggest the way territory-form.tsx's uncovered-region assistant
     does, and FormPage's aside is optional - dropping it also drops the
     reserved 20rem second column (form-page.tsx), so this form gets the
     content-column constraint alone, at full width.

     TWO SECTIONS, SAME LEVEL (owner, 2026-09-11: 域 部门设置同级标题，
     提供icon title) - 关联区域 is its own icon+title Section beside 部门
     设置, not nested inside it. gap-xl (32px, up from the lg/24px every
     other page's sibling-Section rhythm uses) between them and before the
     button row (owner, 2026-09-11: 两个标题之间，gap 增加一些) - the
     128px-wide field columns already read as spacious, and 24px between
     two full Sections looked tight by comparison.

     THE INDENT (owner, 2026-09-11: 内容板块缩进，与标题文字对齐) - the
     header's own icon + gap-lg puts the TITLE text one icon-width in;
     everything below it used to start at the section's left edge instead,
     under the icon rather than under the title. The invisible spacer below
     is the same icon at the same size, so the content column lines up
     with the title text regardless of how many pixels "lg" resolves to. */
  return (
    <>
      <FormPage
        form={
          <div className="gap-xl flex flex-col">
            <Section icon="tree-structure" title={ORG_TEXT.formTitle} description={ORG_TEXT.formSectionWhy}>
              <div className="gap-lg flex">
                <span className="invisible shrink-0" aria-hidden="true">
                  <Icon name="tree-structure" size="lg" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-lg">
                  {/* 一行两条，横向 gap = 128px，纵向按原来的行间距 - 不是
                      32px（owner, 2026-09-11 指出这太松，问行业惯例是多少）
                      而是 16px/gap-md，两列表单行与行之间常见的量。 */}
                  <FormFields gap="128">
                    <Field>
                      <FieldLabel>{ORG_TEXT.parentField}</FieldLabel>
                      {/* 信息选择或输入框，最大宽度 (owner, 2026-09-11) - a
                          128px column gap already gives this row room; the
                          control itself does not also need to fill it.
                          `wrapperClassName`, not `className`: NativeSelect
                          renders its chevron absolutely-positioned against
                          the OUTER span, which stays w-full regardless of
                          what width lands on the <select> itself - capping
                          the wrong element leaves the arrow floating off to
                          the right of a select that visibly stopped short
                          of it (caught live at a single-column width). */}
                      <NativeSelect
                        wrapperClassName="max-w-(--vx-container-sm)"
                        value={parentValue}
                        onChange={(e) => setParentValue(e.target.value)}
                        disabled={pending}
                      >
                        <option value="">{ORG_TEXT.parentNone}</option>
                        {parents.map((u) => (
                          <option key={u.id} value={u.id}>{ORG_TEXT.optionIndent(u.depth, u.name)}</option>
                        ))}
                      </NativeSelect>
                      <FieldDescription>{ORG_TEXT.parentHint}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>{ORG_TEXT.kindField}</FieldLabel>
                      <div className="gap-sm flex items-center">
                        <NativeSelect
                          wrapperClassName="min-w-0 max-w-(--vx-container-sm) grow"
                          value={kindValue}
                          onChange={(e) => setKindValue(e.target.value)}
                          disabled={pending}
                        >
                          <option value="">{ORG_TEXT.kindUnset}</option>
                          {kinds.map((k) => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </NativeSelect>
                        <Button asChild variant="secondary" className="shrink-0">
                          <a href="/admin/org/kinds">{ORG_TEXT.kindConfigure}</a>
                        </Button>
                      </div>
                    </Field>
                    <Field>
                      <FieldLabel>{ORG_TEXT.code}</FieldLabel>
                      <Input
                        className="max-w-(--vx-container-sm)"
                        value={codeValue}
                        onChange={(e) => setCodeValue(e.target.value.toLowerCase())}
                        /* The anchor: locked once created (0051). */
                        disabled={!isNew || pending}
                      />
                      <FieldDescription>{isNew ? ORG_TEXT.codeHint : ORG_TEXT.codeLocked}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>{ORG_TEXT.nameLabel}</FieldLabel>
                      <Input
                        className="max-w-(--vx-container-sm)"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        disabled={pending}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>{ORG_TEXT.leaderField}</FieldLabel>
                      <NativeSelect
                        wrapperClassName="max-w-(--vx-container-sm)"
                        value={leaderValue}
                        onChange={(e) => setLeaderValue(e.target.value)}
                        disabled={pending}
                      >
                        <option value="">{ORG_TEXT.leaderNone}</option>
                        {leaders.map((m) => (
                          <option key={m.sub} value={m.sub}>{m.name}</option>
                        ))}
                      </NativeSelect>
                      <FieldDescription>{ORG_TEXT.leaderHint}</FieldDescription>
                    </Field>
                  </FormFields>
                </div>
              </div>
            </Section>

            {/* 关联区域 - 域，与部门设置同级标题 (owner, 2026-09-11: 域 部门
                设置同级标题，提供icon title) - icon+title 之后紧跟按钮作为
                Section 的 action（owner, 2026-09-11: 把按钮放在标题的区，
                居右显示 - SectionHeader 的 action 本来就贴右）。选择区域
                （原手动选择改名，放第一个）一步同时切到手动模式并打开抽屉 -
                不再是"点手动选择露出第二个按钮"两步；它是唯一真正的动作，
                所以是唯一的 primary（默认 variant），其余两个只是"放弃
                手动，交给自动"的说法，都是 secondary。内容区在还没有点过
                任何按钮时显示"请选择"，点过之后才显示关联区域或对应的
                描述文字。 */}
            <Section
              icon="map-pin"
              title={ORG_TEXT.formDivisionTitle}
              action={
                <div className="gap-sm flex flex-wrap items-center justify-end">
                  <Button type="button" disabled={divisionPending} onClick={chooseManualDivision}>
                    {ORG_TEXT.formDivisionChoose}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={divisionPending}
                    onClick={() => chooseDivisionMode("aggregate")}
                  >
                    {ORG_TEXT.divisionModeAggregate}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={divisionPending}
                    onClick={() => chooseDivisionMode("inherited")}
                  >
                    {ORG_TEXT.divisionModeInherited}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={divisionPending}
                    onClick={() => chooseDivisionMode("none")}
                  >
                    {ORG_TEXT.divisionModeNone}
                  </Button>
                </div>
              }
            >
              <div className="gap-lg flex">
                <span className="invisible shrink-0" aria-hidden="true">
                  <Icon name="map-pin" size="lg" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-2xs">
                  {!chosen ? (
                    <p className="text-muted-foreground text-body-sm">{ORG_TEXT.formDivisionUnset}</p>
                  ) : divisionMode === "manual" ? (
                    <>
                      {/* 已选择 (owner, 2026-09-11) - the label for the one
                          mode that is a real pick, not an automatic
                          resolution; the chips right under it already are
                          the answer to "which ones". */}
                      <p className="text-body-sm text-foreground">{ORG_TEXT.divisionChosenLabel}</p>
                      {chips.length > 0 ? (
                        <ul className="gap-2xs flex flex-wrap">
                          {chips.map((did) => {
                            const opt = divisionOptions.find((d) => d.id === did);
                            return opt ? <li key={did}><Tag>{opt.name}</Tag></li> : null;
                          })}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-body-sm">{ORG_TEXT.noTerritory}</p>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 已设定：X (owner, 2026-09-11: 设定向下聚合/向上继承
                          不能一直显示为无范围) - the label names the MODE
                          that was set; the line under it is the RESULT that
                          mode resolves to right now - the actual 大区 names
                          for aggregate/inherited, or 无范围 for 无区域 (same
                          word both places there, since that mode's setting
                          and its result are the same fact). */}
                      <p className="text-body-sm text-foreground">
                        {ORG_TEXT.divisionSetLabel(
                          divisionMode === "aggregate"
                            ? ORG_TEXT.divisionModeAggregate
                            : divisionMode === "inherited"
                              ? ORG_TEXT.divisionModeInherited
                              : ORG_TEXT.noTerritory,
                        )}
                      </p>
                      {divisionMode !== "none" && effectiveDivisionNames.length > 0 ? (
                        <ul className="gap-2xs flex flex-wrap">
                          {effectiveDivisionNames.map((n) => (
                            <li key={n}><Tag>{n}</Tag></li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-body-sm">{ORG_TEXT.noTerritory}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Section>

            <FormActions
              saveLabel={ORG_TEXT.save}
              discardLabel={ORG_TEXT.discard}
              onSave={submit}
              onDiscard={() => router.push("/admin/org")}
              pending={pending}
              error={error}
              errorTitle={ORG_TEXT.saveFailed}
              destructive={
                !isNew && children === 0
                  ? {
                      label: ORG_TEXT.remove,
                      confirm: {
                        verb: ORG_TEXT.remove,
                        target: ORG_TEXT.removeTarget(name),
                        consequence: ORG_TEXT.removeConsequence(members),
                        titleTemplate: ORG_TEXT.destructiveTitle,
                        cancelLabel: ORG_TEXT.cancel,
                        onConfirm: remove,
                      },
                    }
                  : undefined
              }
            />
          </div>
        }
      />

      <Drawer
        open={divisionDrawerOpen}
        onClose={() => setDivisionDrawerOpen(false)}
        width="md"
        title={ORG_TEXT.formDivisionDrawerTitle}
        description={ORG_TEXT.formDivisionDrawerWhy}
        closeLabel={ORG_TEXT.cancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={divisionPending} onClick={() => setDivisionDrawerOpen(false)}>
              {ORG_TEXT.cancel}
            </Button>
            <Button disabled={divisionPending} onClick={saveDivisions}>{ORG_TEXT.save}</Button>
          </div>
        }
      >
        {divisionOptions.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{ORG_TEXT.formDivisionDrawerEmpty}</p>
        ) : (
          <ul className="gap-2xs flex flex-col">
            {divisionOptions.map((d) => (
              <li key={d.id}>
                <label className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs">
                  <input type="checkbox" checked={divisionSelection.includes(d.id)} onChange={() => toggleDivision(d.id)} />
                  <span className="text-body-sm">{d.name}</span>
                  <span className="text-muted-foreground text-body-sm">{d.code}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}
