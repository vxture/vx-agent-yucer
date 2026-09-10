"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Banner,
  Button,
  DestructiveButton,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { removeOrgUnitAction, saveOrgUnitAction } from "../admin/org/actions";
import { FormFields } from "./form-page";

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
}) {
  const { ORG_ERROR, ORG_TEXT } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState(unitCode);
  const [nameValue, setNameValue] = useState(name);
  const [parentValue, setParentValue] = useState(parentId ?? "");
  const [kindValue, setKindValue] = useState(kindId ?? "");
  const [leaderValue, setLeaderValue] = useState(leaderSub ?? "");

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
  );
}
