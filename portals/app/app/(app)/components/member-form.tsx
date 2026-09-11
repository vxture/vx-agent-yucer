"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  NativeSelect,
  Section,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { saveMemberAction, setMemberInactive } from "../admin/members/actions";
import { FormActions, FormFieldWide, FormFields } from "./form-page";
import { Tag } from "./tag";

/* 配置成员 - THE ONE FORM a member is configured on (owner, 2026-09-10).
 *
 * THREE QUESTIONS: which roles (a set of checkboxes over the workspace's own
 * roles, 0046), which units (0051, a SET since 0053 - owner: 一人在多个组织内 -
 * with 配置 beside it because the list is the organisation's), and what they
 * may see (0022 / 0052: the scope, and for 本区域 the territories).
 *
 * THE LAST-ADMINISTRATOR GUARD IS THE SERVICE'S. This form greys the box it
 * knows would be refused and says why; the refusal is re-decided on save.
 *
 * THE WAY OUT: 保存成员 · 放弃 · 停用成员, the last confirmed and offered only
 * on an active member who is not the last administrator.
 */

export interface RoleOption {
  readonly code: string;
  readonly name: string;
  readonly admin: boolean;
}

export function MemberForm({
  sub,
  name,
  status,
  roles,
  held,
  lastAdmin,
  units,
  unitIds,
  scope,
  scopes,
  territories,
  territoryIds,
}: {
  readonly sub: string;
  readonly name: string;
  readonly status: string;
  /** The workspace's roles, in its order. */
  readonly roles: readonly RoleOption[];
  readonly held: readonly string[];
  /** This member is the only active holder of an administering role. */
  readonly lastAdmin: boolean;
  readonly units: readonly { readonly id: string; readonly name: string; readonly depth: number }[];
  readonly unitIds: readonly string[];
  readonly scope: string;
  readonly scopes: readonly string[];
  readonly territories: readonly { readonly id: string; readonly name: string }[];
  readonly territoryIds: readonly string[];
}) {
  const { MEMBER_ERROR, MEMBER_TEXT, ORG_TEXT } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set(held));
  const [chosenUnits, setChosenUnits] = useState<Set<string>>(new Set(unitIds));
  const [scopeValue, setScopeValue] = useState(scope);
  const [terr, setTerr] = useState<Set<string>>(new Set(territoryIds));

  const toggleRole = (code: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const toggleUnit = (id: string) =>
    setChosenUnits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleTerr = (id: string) =>
    setTerr((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveMemberAction(sub, {
        roles: [...chosen],
        unitIds: [...chosenUnits],
        scope: scopeValue,
        territoryIds: [...terr],
      });
      if (!r.ok) setError(MEMBER_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
      else router.push("/admin/members");
    });
  };
  const deactivate = () => {
    setError(null);
    start(async () => {
      const r = await setMemberInactive(sub);
      if (!r.ok) setError(MEMBER_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
      else router.push("/admin/members");
    });
  };

  return (
    <div className="gap-lg flex flex-col">
      <Section title={MEMBER_TEXT.formTitle}>
        <FormFields>
          <FormFieldWide>
            <Field>
              <FieldLabel>{MEMBER_TEXT.rolesField}</FieldLabel>
              {roles.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">{MEMBER_TEXT.rolesNone}</p>
              ) : (
                <div className="gap-2xs md:grid-cols-3 grid grid-cols-2">
                  {roles.map((r) => {
                    // The one box the service would refuse to untick.
                    const locked = lastAdmin && r.admin && chosen.has(r.code);
                    return (
                      <label className="gap-2xs flex items-center" key={r.code} htmlFor={`role-${r.code}`}>
                        <Checkbox
                          id={`role-${r.code}`}
                          checked={chosen.has(r.code)}
                          disabled={pending || locked}
                          onCheckedChange={() => toggleRole(r.code)}
                        />
                        <span className="text-body-sm">{r.name}</span>
                        {r.admin ? <Tag tone="info">{MEMBER_TEXT.adminBadge}</Tag> : null}
                        {locked ? <span className="text-muted-foreground text-body-sm">{MEMBER_TEXT.lastAdminHint}</span> : null}
                      </label>
                    );
                  })}
                </div>
              )}
              <FieldDescription>{MEMBER_TEXT.rolesHint}</FieldDescription>
            </Field>
          </FormFieldWide>

          <FormFieldWide>
            <Field>
              <div className="gap-sm flex items-center justify-between">
                <FieldLabel>{MEMBER_TEXT.unitField}</FieldLabel>
                <Button asChild variant="secondary" size="sm" className="shrink-0">
                  <a href="/admin/org">{MEMBER_TEXT.unitConfigure}</a>
                </Button>
              </div>
              {units.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">{MEMBER_TEXT.unitsNone}</p>
              ) : (
                /* A set, like the roles: one box per unit, indented to the
                   tree's depth so a team reads under its region. */
                <div className="gap-2xs md:grid-cols-3 grid grid-cols-2">
                  {units.map((u) => (
                    <label className="gap-2xs flex items-center" key={u.id} htmlFor={`unit-${u.id}`}>
                      <Checkbox id={`unit-${u.id}`} checked={chosenUnits.has(u.id)} disabled={pending} onCheckedChange={() => toggleUnit(u.id)} />
                      <span className="text-body-sm whitespace-pre">{ORG_TEXT.optionIndent(u.depth, u.name)}</span>
                    </label>
                  ))}
                </div>
              )}
              <FieldDescription>{MEMBER_TEXT.unitsHint}</FieldDescription>
            </Field>
          </FormFieldWide>

          <Field>
            <FieldLabel>{MEMBER_TEXT.scopeField}</FieldLabel>
            <NativeSelect value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} disabled={pending}>
              {scopes.map((k) => (
                <option key={k} value={k}>{MEMBER_TEXT.scopeLabels[k] ?? k}</option>
              ))}
            </NativeSelect>
            {scopeValue === "unit" && chosenUnits.size === 0 ? (
              <FieldDescription>{MEMBER_TEXT.scopeUnitUnplaced}</FieldDescription>
            ) : null}
          </Field>

          {scopeValue === "territory" ? (
            <FormFieldWide>
              <Field>
                <FieldLabel>{MEMBER_TEXT.territoriesField}</FieldLabel>
                {territories.length === 0 ? (
                  <p className="text-muted-foreground text-body-sm">{MEMBER_TEXT.territoriesNone}</p>
                ) : (
                  <div className="gap-2xs md:grid-cols-3 grid grid-cols-2">
                    {territories.map((t) => (
                      <label className="gap-2xs flex items-center" key={t.id} htmlFor={`terr-${t.id}`}>
                        <Checkbox id={`terr-${t.id}`} checked={terr.has(t.id)} disabled={pending} onCheckedChange={() => toggleTerr(t.id)} />
                        <span className="text-body-sm">{t.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <FieldDescription>{MEMBER_TEXT.territoriesHint}</FieldDescription>
              </Field>
            </FormFieldWide>
          ) : null}
        </FormFields>
      </Section>

      <FormActions
        saveLabel={MEMBER_TEXT.save}
        discardLabel={MEMBER_TEXT.discard}
        onSave={submit}
        onDiscard={() => router.push("/admin/members")}
        pending={pending}
        error={error}
        errorTitle={MEMBER_TEXT.saveFailed}
        destructive={
          status === "active" && !lastAdmin
            ? {
                label: MEMBER_TEXT.deactivateMenu,
                confirm: {
                  verb: MEMBER_TEXT.deactivateMenu,
                  target: MEMBER_TEXT.deactivateTarget(name),
                  consequence: MEMBER_TEXT.deactivateHint,
                  titleTemplate: MEMBER_TEXT.destructiveTitle,
                  cancelLabel: MEMBER_TEXT.cancel,
                  onConfirm: deactivate,
                },
              }
            : undefined
        }
      />
    </div>
  );
}
