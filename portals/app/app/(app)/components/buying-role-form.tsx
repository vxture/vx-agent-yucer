"use client";

import { useState } from "react";
import { Field, FieldLabel, Input, NativeSelect, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useSaveAction } from "../lib/use-save-action";
import { SaveRow } from "./save-row";

// Stating who somebody is on THIS deal - incr/0027, ADR-024.
//
// This is the only control in the product that writes a buying role, and it
// sits on a deal because that is the only place the question has an answer.
// Before this batch the same question was asked on the customer's contact
// roster, and one answer there was applied to every deal at once.
//
// A PERSON PICKER, NOT A FREE FIELD. The people are the customer's roster;
// inventing one here would create somebody who works nowhere, which
// person_affiliation exists to prevent.
//
// ROLE AND STANCE ARE TWO FIELDS, since incr/0075 - 组织内角色分类 vs 对我方
// 的立场态度. "blocker" is no longer offered here: it used to answer both
// "what is this person's function" and "are they against us" with one value,
// the same one-column-two-questions shape ADR-024 already criticised for
// person.decision_role. A new statement picks a real function (EB/UB/TB/
// Coach) and, separately, a stance - existing rows that still say "blocker"
// keep displaying as such elsewhere, this form just does not write it again.

const SELECTABLE_ROLES = ["economic", "user", "technical", "coach"] as const;

export interface BuyingRolePerson {
  readonly id: string;
  readonly name: string;
  /** What this deal already says, so the form opens on the truth. */
  readonly buyingRole: string;
  readonly influence: number | null;
  readonly stance: string | null;
}

export interface BuyingRoleFormProps {
  readonly opportunityId: string;
  readonly accountId: string;
  readonly people: readonly BuyingRolePerson[];
  readonly canEdit: boolean;
  readonly onSave: (
    opportunityId: string,
    accountId: string,
    personId: string,
    buyingRole: string,
    influence: number | null,
    stance: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function BuyingRoleForm({
  opportunityId,
  accountId,
  people,
  canEdit,
  onSave,
}: BuyingRoleFormProps) {
  const { BUYING_ROLE_TEXT, DECISION_ROLE_LABEL, DECISION_ROLE_ABBR, STANCE_LABEL, CONTACT_ERROR } = useMessages();
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState("unknown");
  const [stance, setStance] = useState("");
  const [influence, setInfluence] = useState("");
  const save = useSaveAction(CONTACT_ERROR);

  if (!canEdit || people.length === 0) return null;

  // Choosing a person loads what the deal already says about them, for the same
  // reason the contact form does: a control that says "editing X" and then
  // writes whatever happened to be in the fields is worse than no control.
  function pick(id: string) {
    setPersonId(id);
    const p = people.find((x) => x.id === id);
    setRole(p?.buyingRole ?? "unknown");
    setStance(p?.stance ?? "");
    setInfluence(p?.influence === null || p?.influence === undefined ? "" : String(p.influence));
  }

  const parsed = influence.trim() === "" ? null : Number(influence);
  const ready =
    personId !== "" &&
    (parsed === null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 100));

  return (
    <Section id="buying-roles" title={BUYING_ROLE_TEXT.title} description={BUYING_ROLE_TEXT.description}>
      {/* Two by two (polish, 2026-09-24): four full-width fields stacked were
          a tall form for four short answers. */}
      <div className="grid gap-md sm:grid-cols-2">
      <Field>
        <FieldLabel>{BUYING_ROLE_TEXT.person}</FieldLabel>
        <NativeSelect value={personId} onChange={(e) => pick(e.target.value)}>
          <option value="">{BUYING_ROLE_TEXT.pickPerson}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>{BUYING_ROLE_TEXT.role}</FieldLabel>
        <NativeSelect value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="unknown">{DECISION_ROLE_LABEL.unknown}</option>
          {SELECTABLE_ROLES.map((k) => (
            <option key={k} value={k}>
              {DECISION_ROLE_ABBR[k] ? `${DECISION_ROLE_ABBR[k]} · ${DECISION_ROLE_LABEL[k]}` : DECISION_ROLE_LABEL[k]}
            </option>
          ))}
          {/* 已有的 blocker 行还能保留原样存回去(不强迫每次编辑都改掉历史
              数据), 只是这个选项不出现在上面的常规列表里 - 一个不在
              SELECTABLE_ROLES 里、但等于当前值的 <option> 才会被浏览器
              渲染出来, 其他人打开表单看不到"阻碍者"这个新选项。 */}
          {role === "blocker" ? <option value="blocker">{DECISION_ROLE_LABEL.blocker}</option> : null}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>{BUYING_ROLE_TEXT.stance}</FieldLabel>
        <NativeSelect value={stance} onChange={(e) => setStance(e.target.value)}>
          <option value="">{BUYING_ROLE_TEXT.stanceNotStated}</option>
          {Object.entries(STANCE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>{BUYING_ROLE_TEXT.influence}</FieldLabel>
        <Input
          type="number"
          min="0"
          max="100"
          step="1"
          inputMode="numeric"
          value={influence}
          onChange={(e) => setInfluence(e.target.value)}
        />
      </Field>
      </div>
      <SaveRow
        action={save}
        label={BUYING_ROLE_TEXT.save}
        savedLabel={BUYING_ROLE_TEXT.saved}
        disabled={!ready}
        onSave={() =>
          save.run(
            () => onSave(opportunityId, accountId, personId, role, parsed, stance === "" ? null : stance),
            () => setPersonId(""),
          )
        }
      />
    </Section>
  );
}
