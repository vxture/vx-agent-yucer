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
import { FormFields } from "./form-page";
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
  /** Territories THIS unit works directly right now - what the drawer opens
   *  pre-ticked to, and what an empty array means by 暂不关联. */
  readonly directTerritoryIds: readonly string[];
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
      if (!r.ok) setError(ORG_ERROR[r.error] ?? r.error);
      else router.push("/admin/org");
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

  /* 选择区域 - opens pre-ticked to what is ALREADY directly linked, so the
     drawer shows the truth rather than an empty form the first time. */
  const openTerritoryDrawer = () => {
    setTerritorySelection(directTerritoryIds);
    setTerritoryDrawerOpen(true);
  };
  const toggleTerritory = (territoryId: string) =>
    setTerritorySelection((prev) => (prev.includes(territoryId) ? prev.filter((t) => t !== territoryId) : [...prev, territoryId]));
  const saveTerritories = () => {
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

  /* THE FULL WIDTH, not FormPage's two-column split: there is no assistant
     beside a unit form, and a grid that reserves 20rem for one would hand
     the fields two-thirds of the page for nothing. FormFields does the
     pairing inside the section. */
  return (
    <div className="gap-lg flex flex-col">
      <Section title={ORG_TEXT.formTitle}>
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

      {/* 关联区域 - EDIT ONLY, see the block comment on TerritoryScope above
          for why this is one real choice (选择区域) plus a read-only
          preview of the automatic outcome (向下聚合/向上继承/暂不关联),
          not four independent settings. */}
      {!isNew ? (
        <Section title={ORG_TEXT.formTerritoryTitle}>
          <div className="gap-sm flex flex-col">
            {directTerritoryIds.length > 0 ? (
              <ul className="gap-2xs flex flex-wrap">
                {directTerritoryIds.map((tid) => {
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
      ) : null}

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
    </div>
  );
}
