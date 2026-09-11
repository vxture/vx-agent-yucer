"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Banner,
  Button,
  DestructiveButton,
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
import { removeOrgUnitAction, saveOrgUnitAction, setUnitTerritoriesAction } from "../admin/org/actions";
import { FormFields, FormPage } from "./form-page";
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

/* 关联区域 (owner, 2026-09-11: 不要补齐所有显示信息，尤其需要设计关联区域 -
 * 向下聚合，向上继承，选择区域，暂不关联，等类型) - EDIT ONLY: a brand-new
 * unit has no id yet to link a territory to, save it first. ONE REAL
 * CHOICE, not four: 选择区域 (a side Drawer, owner: 选择区域可以用侧栏抽屉)
 * ticks which territories this unit works DIRECTLY - the only thing that
 * actually writes anything. Left at 暂不关联 (nothing ticked, the default),
 * the section shows a READ-ONLY PREVIEW of what 按组织 data-scope already
 * computes automatically from the unit's tree position - 向下聚合 (its own
 * subtree's territories) or 向上继承 (the nearest ancestor's, once its own
 * subtree has none) - via effectiveTerritoryIds, the SAME function
 * resolve-scope.ts's `unit` branch and the org-structure table both call,
 * so this preview cannot promise a scope the member would not actually
 * get. Nothing here recomputes the table's fuller 全范围/已聚合/已继承/
 * 无范围 badges - a create/edit form needs the one fact (what will this
 * unit work), not the table's whole display.
 */
export type TerritoryScope = "none" | "partial" | "full" | "inherited";
export interface TerritoryOption {
  readonly id: string;
  /** regions[0] if the territory has a live 大区, else its own static
   *  name - same preference as the org-structure table's badge. */
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
  territoryOptions,
  directTerritoryIds,
  liveDirectTerritoryIds,
  scope,
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
  /** Every territory this workspace has - the 选择区域 drawer's checklist.
   *  Unused (and the whole section hidden) while `isNew`. */
  readonly territoryOptions: readonly TerritoryOption[];
  /** Territories THIS unit works directly right now, unfiltered - what the
   *  drawer opens pre-ticked to, so a since-invalidated link is still
   *  visible there to clear. */
  readonly directTerritoryIds: readonly string[];
  /** The subset of `directTerritoryIds` whose division still exists (owner,
   *  2026-09-11: 可以关联失效，但是不能是错的关联) - what the COLLAPSED
   *  section renders as chips. A direct link that just went invalid is not
   *  shown as a chip naming ground the unit no longer has; the section
   *  falls to the 向下聚合/向上继承/暂不关联 preview instead, same as the
   *  org-structure table. */
  readonly liveDirectTerritoryIds: readonly string[];
  /** The EFFECTIVE outcome if nothing more is ticked - computed server-side
   *  by the same function the org-structure table and resolve-scope.ts use. */
  readonly scope: TerritoryScope;
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
  const [territoryDrawerOpen, setTerritoryDrawerOpen] = useState(false);
  const [territorySelection, setTerritorySelection] = useState<readonly string[]>(directTerritoryIds);
  const [territoryPending, startTerritory] = useTransition();
  /* 关联区域模式 (owner, 2026-09-11: 右侧下拉 - 向下聚合/向上继承/手动选择/
     无区域) - underneath, there are really only two states (a direct pick,
     or not), and `manualIntent` is that switch. The other three dropdown
     labels are DISPLAY of what the tree already resolves automatically
     (same `scope`/`liveDirectTerritoryIds` the collapsed chips used before
     this dropdown existed) - picking any of them just means "give up the
     direct pick", so the select re-syncs to whichever of the three is
     actually true once the write lands, regardless of which of the three
     the admin happened to click. */
  const [manualIntent, setManualIntent] = useState(
    isNew ? territorySelection.length > 0 : liveDirectTerritoryIds.length > 0,
  );
  type TerritoryMode = "aggregate" | "inherited" | "manual" | "none";
  const territoryMode: TerritoryMode = manualIntent
    ? "manual"
    : scope === "full" || scope === "partial"
      ? "aggregate"
      : scope === "inherited"
        ? "inherited"
        : "none";
  /** What the content area lists as chips - the pending pick while new, the
   *  live direct links while editing. Empty falls to the badge word for
   *  whichever of aggregate/inherited/none is actually true. */
  const chips = isNew ? territorySelection : liveDirectTerritoryIds;
  /* 内容区空时显示请选择 (owner, 2026-09-11) - EDIT always has a real
     answer already (the server computed `scope` before this form ever
     rendered), so it starts chosen. NEW starts unchosen until the admin
     actually clicks one of the four buttons - before that there is nothing
     to show a badge word FOR, so 请选择 stands in rather than defaulting
     to 无区域 as if that had been decided. */
  const [chosen, setChosen] = useState(!isNew || territorySelection.length > 0);

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
      // 组织与区域关联设置 (owner, 2026-09-11: 新建页面也要有) - a brand-new
      // unit has no id until THIS save succeeds, so 选择区域 could only hold
      // the pick locally; apply it now that the unit is real. The unit
      // itself is already created - a failure here is reported but does not
      // block leaving, or a working unit would be stuck behind a retry loop
      // for a step that has its own fix (open 选择区域 again from 单位配置).
      if (isNew && territorySelection.length > 0) {
        const t = await setUnitTerritoriesAction(r.id, territorySelection);
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
  const openTerritoryDrawer = () => {
    if (!isNew) setTerritorySelection(directTerritoryIds);
    setTerritoryDrawerOpen(true);
  };
  const toggleTerritory = (territoryId: string) =>
    setTerritorySelection((prev) => (prev.includes(territoryId) ? prev.filter((t) => t !== territoryId) : [...prev, territoryId]));
  /* NEW: nothing to write yet - 保存单位 applies `territorySelection` once
     the unit has an id (see submit() above). EDIT: writes immediately,
     matching every other field on this form reading "保存" as "commit now". */
  const saveTerritories = () => {
    if (isNew) {
      setTerritoryDrawerOpen(false);
      return;
    }
    if (!id) return;
    startTerritory(async () => {
      const r = await setUnitTerritoriesAction(id, territorySelection);
      if (!r.ok) {
        toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
        return;
      }
      toast({ tone: "success", title: ORG_TEXT.formTerritoryDone });
      setTerritoryDrawerOpen(false);
      router.refresh();
    });
  };
  /* Picking one of the four buttons. "手动选择" only flips the local intent -
     nothing is written until 选择区域 actually ticks something and (edit)
     saves, or (new) 保存单位 applies the pending pick. Picking any of the
     other three gives up a direct link that may not exist yet, in which
     case there is nothing to write and this is a no-op past the flag.
     Any of the four also settles `chosen` - 请选择 is only for BEFORE a
     button has been clicked at all. */
  const chooseTerritoryMode = (mode: TerritoryMode) => {
    setChosen(true);
    if (mode === "manual") {
      setManualIntent(true);
      return;
    }
    setManualIntent(false);
    if (territorySelection.length === 0 && liveDirectTerritoryIds.length === 0) return;
    if (isNew) {
      setTerritorySelection([]);
      return;
    }
    if (!id) return;
    startTerritory(async () => {
      const r = await setUnitTerritoriesAction(id, []);
      if (!r.ok) {
        toast({ tone: "danger", title: ORG_ERROR[r.error] ?? r.error });
        return;
      }
      setTerritorySelection([]);
      toast({ tone: "success", title: ORG_TEXT.formTerritoryDone });
      router.refresh();
    });
  };

  /* FormPage - THE SHAPE EVERY DEDICATED FORM PAGE SHARES (owner ruling,
     2026-09-05, form-page.tsx). No `assist`: there is nothing this form has
     to suggest the way territory-form.tsx's uncovered-region assistant
     does, and FormPage's aside is optional - dropping it also drops the
     reserved 20rem second column (form-page.tsx), so this form gets the
     content-column constraint alone, at full width.

     ONE SECTION, NOT TWO (owner, 2026-09-11: 标题全面引用DS - icon/title/
     desc；关联区域提升为小标题) - 关联区域 used to be its own boxed Section
     below this one; it is a property OF the department, not a second
     topic, so it is now a level-4 SectionHeader inside the same Section,
     with the mode dropdown standing in its `action` slot the way every
     other Section-level control does.

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
          <div className="gap-lg flex flex-col">
            <Section icon="tree-structure" title={ORG_TEXT.formTitle} description={ORG_TEXT.formSectionWhy}>
              <div className="gap-lg flex">
                <span className="invisible shrink-0" aria-hidden="true">
                  <Icon name="tree-structure" size="lg" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-lg">
                  {/* 一行两条，gap = 128px (owner, 2026-09-11). */}
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
                设置同级标题，提供icon title；把下拉框展开为四个按钮，手动
                选择-primary) - 手动选择是唯一真正的动作（打开抽屉写入），
                所以只有它是 primary（默认 variant），其余三个只是"放弃
                手动，交给自动"的说法，都是 secondary。内容区在还没有点过
                任何按钮时显示"请选择"，点过之后才显示关联区域或对应的
                描述文字。 */}
            <Section icon="map-pin" title={ORG_TEXT.formTerritoryTitle}>
              <div className="gap-lg flex">
                <span className="invisible shrink-0" aria-hidden="true">
                  <Icon name="map-pin" size="lg" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-sm">
                  <div className="gap-sm flex flex-wrap items-center">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={territoryPending}
                      onClick={() => chooseTerritoryMode("aggregate")}
                    >
                      {ORG_TEXT.territoryModeAggregate}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={territoryPending}
                      onClick={() => chooseTerritoryMode("inherited")}
                    >
                      {ORG_TEXT.territoryModeInherited}
                    </Button>
                    <Button type="button" disabled={territoryPending} onClick={() => chooseTerritoryMode("manual")}>
                      {ORG_TEXT.territoryModeManual}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={territoryPending}
                      onClick={() => chooseTerritoryMode("none")}
                    >
                      {ORG_TEXT.territoryModeNone}
                    </Button>
                    {territoryMode === "manual" ? (
                      <Button type="button" variant="secondary" onClick={openTerritoryDrawer}>
                        {ORG_TEXT.formTerritoryChoose}
                      </Button>
                    ) : null}
                  </div>
                  <div className="w-full">
                    {!chosen ? (
                      <p className="text-muted-foreground text-body-sm">{ORG_TEXT.formTerritoryUnset}</p>
                    ) : chips.length > 0 ? (
                      <ul className="gap-2xs flex flex-wrap">
                        {chips.map((tid) => {
                          const opt = territoryOptions.find((t) => t.id === tid);
                          return opt ? <li key={tid}><Tag>{opt.name}</Tag></li> : null;
                        })}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-body-sm">
                        {territoryMode === "aggregate"
                          ? ORG_TEXT.aggregateTerritory
                          : territoryMode === "inherited"
                            ? ORG_TEXT.inheritedTerritory
                            : ORG_TEXT.noTerritory}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* 底部按钮迁移到右侧，顺序调整 (owner, 2026-09-11): 保存单位是
                最终动作，靠右排在最后；放弃紧挨着它。删除单位仍然是危险
                操作，用 mr-auto 单独钉在左边，跟"接下来做什么"的两个按钮
                分开，而不必在没有它时补一个占位元素。 */}
            <div className="border-border flex flex-col gap-md border-t pt-md">
              <div className="gap-sm flex items-center justify-end">
                {!isNew && children === 0 ? (
                  <DestructiveButton
                    className="mr-auto"
                    disabled={pending}
                    confirm={{
                      verb: ORG_TEXT.remove,
                      target: ORG_TEXT.removeTarget(name),
                      consequence: ORG_TEXT.removeConsequence(members),
                      titleTemplate: ORG_TEXT.destructiveTitle,
                      cancelLabel: ORG_TEXT.cancel,
                      onConfirm: remove,
                    }}
                  >
                    {ORG_TEXT.remove}
                  </DestructiveButton>
                ) : null}
                <Button variant="secondary" disabled={pending} onClick={() => router.push("/admin/org")}>
                  {ORG_TEXT.discard}
                </Button>
                <Button onClick={submit} disabled={pending}>{ORG_TEXT.save}</Button>
              </div>
              {error ? <Banner tone="danger" title={ORG_TEXT.saveFailed} description={error} /> : null}
            </div>
          </div>
        }
      />

      <Drawer
        open={territoryDrawerOpen}
        onClose={() => setTerritoryDrawerOpen(false)}
        width="md"
        title={ORG_TEXT.formTerritoryDrawerTitle}
        description={ORG_TEXT.formTerritoryDrawerWhy}
        closeLabel={ORG_TEXT.cancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={territoryPending} onClick={() => setTerritoryDrawerOpen(false)}>
              {ORG_TEXT.cancel}
            </Button>
            <Button disabled={territoryPending} onClick={saveTerritories}>{ORG_TEXT.save}</Button>
          </div>
        }
      >
        {territoryOptions.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{ORG_TEXT.formTerritoryDrawerEmpty}</p>
        ) : (
          <ul className="gap-2xs flex flex-col">
            {territoryOptions.map((t) => (
              <li key={t.id}>
                <label className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs">
                  <input type="checkbox" checked={territorySelection.includes(t.id)} onChange={() => toggleTerritory(t.id)} />
                  <span className="text-body-sm">{t.name}</span>
                  <span className="text-muted-foreground text-body-sm">{t.code}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}
