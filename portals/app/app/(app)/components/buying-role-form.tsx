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

export interface BuyingRolePerson {
  readonly id: string;
  readonly name: string;
  /** What this deal already says, so the form opens on the truth. */
  readonly buyingRole: string;
  readonly influence: number | null;
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
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function BuyingRoleForm({
  opportunityId,
  accountId,
  people,
  canEdit,
  onSave,
}: BuyingRoleFormProps) {
  const { BUYING_ROLE_TEXT, DECISION_ROLE_LABEL, CONTACT_ERROR } = useMessages();
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState("unknown");
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
    setInfluence(p?.influence === null || p?.influence === undefined ? "" : String(p.influence));
  }

  const parsed = influence.trim() === "" ? null : Number(influence);
  const ready =
    personId !== "" &&
    (parsed === null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 100));

  return (
    <Section id="buying-roles" title={BUYING_ROLE_TEXT.title} description={BUYING_ROLE_TEXT.description}>
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
          {Object.entries(DECISION_ROLE_LABEL).map(([k, label]) => (
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
      <SaveRow
        action={save}
        label={BUYING_ROLE_TEXT.save}
        savedLabel={BUYING_ROLE_TEXT.saved}
        disabled={!ready}
        onSave={() =>
          save.run(
            () => onSave(opportunityId, accountId, personId, role, parsed),
            () => setPersonId(""),
          )
        }
      />
    </Section>
  );
}
