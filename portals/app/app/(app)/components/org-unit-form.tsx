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
  effectiveTerritoryNames,
  inheritedFromName,
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
  readonly effectiveTerritoryNames: readonly string[];
  readonly inheritedFromName: string | null;
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

  /* FormPage - THE SHAPE EVERY DEDICATED FORM PAGE SHARES (owner ruling,
     2026-09-05, form-page.tsx). No `assist`: there is nothing this form has
     to suggest the way territory-form.tsx's uncovered-region assistant
     does, and FormPage's aside is optional - omitting it still gets the
     content-column constraint that keeps this page's fields the same
     measure as every other dedicated form, instead of stretching bare
     under the page title (owner, 2026-09-11: 内容区没有缩紧，要与标题文本
     对齐). The icon on Section matches the page's own ViewHeader icon,
     same as territory-form.tsx/plan-form.tsx/etc - the page ViewHeader
     still owns the TITLE TEXT, so Section only repeats the icon, not the
     sentence. */
  return (
    <>
      <FormPage
        form={
          <div className="gap-lg flex flex-col">
            <Section icon="tree-structure" title={ORG_TEXT.formTitle}>
              <FormFields>
                <Field>
                  <FieldLabel>{ORG_TEXT.parentField}</FieldLabel>
                  <NativeSelect value={parentValue} onChange={(e) => setParentValue(e.target.value)} disabled={pending}>
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
                    <div className="min-w-0 grow">
                      <NativeSelect value={kindValue} onChange={(e) => setKindValue(e.target.value)} disabled={pending}>
                        <option value="">{ORG_TEXT.kindUnset}</option>
                        {kinds.map((k) => (
                          <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                      </NativeSelect>
                    </div>
                    <Button asChild variant="secondary" className="shrink-0">
                      <a href="/admin/org/kinds">{ORG_TEXT.kindConfigure}</a>
                    </Button>
                  </div>
                </Field>
                <Field>
                  <FieldLabel>{ORG_TEXT.code}</FieldLabel>
                  <Input
                    value={codeValue}
                    onChange={(e) => setCodeValue(e.target.value.toLowerCase())}
                    /* The anchor: locked once created (0051). */
                    disabled={!isNew || pending}
                  />
                  <FieldDescription>{isNew ? ORG_TEXT.codeHint : ORG_TEXT.codeLocked}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{ORG_TEXT.nameLabel}</FieldLabel>
                  <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} disabled={pending} />
                </Field>
                <Field>
                  <FieldLabel>{ORG_TEXT.leaderField}</FieldLabel>
                  <NativeSelect value={leaderValue} onChange={(e) => setLeaderValue(e.target.value)} disabled={pending}>
                    <option value="">{ORG_TEXT.leaderNone}</option>
                    {leaders.map((m) => (
                      <option key={m.sub} value={m.sub}>{m.name}</option>
                    ))}
                  </NativeSelect>
                  <FieldDescription>{ORG_TEXT.leaderHint}</FieldDescription>
                </Field>
              </FormFields>
            </Section>

            {/* 关联区域 (owner, 2026-09-11: 组织与区域关联设置没有 - 新建页面
                也要有) - ONE real choice (选择区域), plus a read-only preview
                of the automatic outcome (向下聚合/向上继承/暂不关联), not
                four independent settings; see the block comment on
                TerritoryScope above. NEW has no id yet to write a direct
                link to, so 选择区域 there only holds the pick locally -
                submit() applies it once 保存单位 gives the unit an id - and
                there is no tree-position preview to show pre-creation, only
                whatever has been picked so far. */}
            <Section title={ORG_TEXT.formTerritoryTitle}>
              <div className="gap-sm flex flex-col">
                {isNew ? (
                  territorySelection.length > 0 ? (
                    <ul className="gap-2xs flex flex-wrap">
                      {territorySelection.map((tid) => {
                        const opt = territoryOptions.find((t) => t.id === tid);
                        return opt ? <li key={tid}><Tag>{opt.name}</Tag></li> : null;
                      })}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-body-sm">{ORG_TEXT.formTerritoryNewHint}</p>
                  )
                ) : liveDirectTerritoryIds.length > 0 ? (
                  <ul className="gap-2xs flex flex-wrap">
                    {liveDirectTerritoryIds.map((tid) => {
                      const opt = territoryOptions.find((t) => t.id === tid);
                      return opt ? <li key={tid}><Tag>{opt.name}</Tag></li> : null;
                    })}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-body-sm">
                    {scope === "full" || scope === "partial"
                      ? ORG_TEXT.formTerritoryAggregateHint(effectiveTerritoryNames.length)
                      : scope === "inherited"
                        ? ORG_TEXT.formTerritoryInheritedHint(inheritedFromName ?? "")
                        : ORG_TEXT.formTerritoryNoneHint}
                  </p>
                )}
                <div>
                  <Button type="button" variant="secondary" onClick={openTerritoryDrawer}>
                    {ORG_TEXT.formTerritoryChoose}
                  </Button>
                </div>
              </div>
            </Section>

            <div className="border-border flex flex-col gap-md border-t pt-md">
              <div className="gap-sm flex items-center">
                <Button onClick={submit} disabled={pending}>{ORG_TEXT.save}</Button>
                <Button variant="secondary" disabled={pending} onClick={() => router.push("/admin/org")}>
                  {ORG_TEXT.discard}
                </Button>
                {!isNew && children === 0 ? (
                  <DestructiveButton
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
