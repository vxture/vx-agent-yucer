"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Label,
  NativeSelect,
  PanelCard,
  PanelItem,
  PanelList,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { DialogForm } from "./dialog-form";
import { ConfirmDestructive } from "./confirm-destructive";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import {
  CRITERION_ROLES,
  EXIT_CRITERION_KINDS,
  type ExitCriterion,
  type ExitCriterionKind,
} from "../../domains/pipeline/lib/exit-criteria";
import { EVIDENCE_SLOTS } from "../../domains/pipeline/lib/evidence";
import { stageRoles } from "../../domains/pipeline/lib/stage-vocab";
import { STAGE_ROLE_ICON, STAGE_ROLE_TONE } from "../lib/stage-role";

// 阶段推进标准 - configuration (incr/0087, YC-065 R1; renamed from 阶段退出条件
// 2026-09-30, owner). One CARD per stage, in the line's own order: the start,
// the process stages, then the two ends. The stages are not entered here - they
// ARE the 商机阶段 above, read from the same catalog, so adding, renaming or
// reordering one shows up here on its own.
//
// Each card holds its criteria: the sentence the deal page shows, how it is
// judged, and its parameters. An end has none - nothing moves on from it - and
// says so. KIND IS LOCKED once a criterion exists - changing how it is judged
// is remove + add, so past checks keep their meaning. A stage with none says
// so on the deal page; it is not "all met".

interface Draft {
  id?: string;
  stageCode: string;
  kind: ExitCriterionKind;
  name: string;
  roles: string[];
  days: number;
  slot: string;
}

const blank = (stageCode: string): Draft => ({
  stageCode,
  kind: "slot_filled",
  name: "",
  roles: ["economic"],
  days: 30,
  slot: "pain",
});

export function ExitCriterionConfig({
  stages,
  criteria,
  editable,
  onSave,
  onDelete,
}: {
  /** The whole catalog, in order - the ends included, as cards with no criteria. */
  readonly stages: readonly {
    readonly stageCode: string;
    readonly name: string;
    readonly sortOrder: number;
    readonly defaultProbability: number;
    readonly isWon: boolean;
    readonly isTerminal: boolean;
  }[];
  readonly criteria: readonly ExitCriterion[];
  readonly editable: boolean;
  readonly onSave: (input: {
    id?: string;
    stageCode: string;
    kind: string;
    param: Record<string, unknown>;
    name: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { EXIT_CONFIG_TEXT, EXIT_CRITERION_ERROR, DECISION_ROLE_LABEL, DEAL_PAGE_TEXT, DS_LABELS } = useMessages();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<ExitCriterion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const describe = (c: ExitCriterion) => {
    const roles = Array.isArray(c.param.roles) ? (c.param.roles as string[]) : [];
    const who = roles.length === 0 ? DEAL_PAGE_TEXT.exitAnyone : roles.map((r) => DECISION_ROLE_LABEL[r] ?? r).join(" / ");
    switch (c.kind) {
      case "role_present":
        return EXIT_CONFIG_TEXT.describeRolePresent(who);
      case "role_reached":
        return EXIT_CONFIG_TEXT.describeRoleReached(who, Number(c.param.days ?? 30));
      case "slot_filled":
        return EXIT_CONFIG_TEXT.describeSlot(DEAL_PAGE_TEXT.evidenceSlot[String(c.param.slot)] ?? String(c.param.slot));
      default:
        return EXIT_CONFIG_TEXT.kind[c.kind];
    }
  };

  const paramOf = (d: Draft): Record<string, unknown> =>
    d.kind === "role_present"
      ? { roles: d.roles }
      : d.kind === "role_reached"
        ? { roles: d.roles, days: d.days }
        : d.kind === "slot_filled"
          ? { slot: d.slot }
          : {};

  const save = () =>
    draft &&
    start(async () => {
      setError(null);
      const r = await onSave({ id: draft.id, stageCode: draft.stageCode, kind: draft.kind, param: paramOf(draft), name: draft.name });
      if (!r.ok) {
        setError(EXIT_CRITERION_ERROR[r.error ?? "denied"] ?? EXIT_CRITERION_ERROR.denied ?? null);
        return;
      }
      setDraft(null);
    });

  const roles = stageRoles(stages);

  return (
    <Section icon="list-checks" title={EXIT_CONFIG_TEXT.title} description={EXIT_CONFIG_TEXT.why}>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
        {stages.map((s, i) => {
          const role = roles[i]!;
          const mine = criteria.filter((c) => c.stageCode === s.stageCode).sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <PanelCard
              key={s.stageCode}
              icon={STAGE_ROLE_ICON[role]}
              tone={STAGE_ROLE_TONE[role] === "neutral" ? "brand" : STAGE_ROLE_TONE[role]}
              title={s.name}
              titleSuffix={<Tag tone={STAGE_ROLE_TONE[role]}>{EXIT_CONFIG_TEXT.position[role]}</Tag>}
              description={`${s.stageCode} · ${EXIT_CONFIG_TEXT.winRate(s.defaultProbability)}`}
              action={
                editable && !s.isTerminal ? (
                  <Button size="sm" variant="ghost" onClick={() => { setError(null); setDraft(blank(s.stageCode)); }}>
                    {EXIT_CONFIG_TEXT.add}
                  </Button>
                ) : undefined
              }
            >
              {s.isTerminal ? (
                <p className="text-muted-foreground text-body-small">{EXIT_CONFIG_TEXT.endNote}</p>
              ) : (
                <PanelList empty={<p className="text-muted-foreground text-body-small">{DEAL_PAGE_TEXT.exitNone}</p>}>
                  {mine.map((c, n) => (
                    <PanelItem
                      key={c.id}
                      lead={<span className="text-muted-foreground tabular-nums">{n + 1}</span>}
                      main={
                        <span className="flex min-w-0 flex-col items-start gap-2xs">
                          <span className="text-foreground text-body-small">{c.name}</span>
                          {/* The rule behind the sentence - skipped when it IS the
                              sentence, which the factory criteria often are. */}
                          {describe(c) !== c.name ? <Tag>{describe(c)}</Tag> : null}
                        </span>
                      }
                      trail={
                        editable ? (
                          <ActionMenu
                            label={DS_LABELS.actionMenu}
                            items={[
                              {
                                id: "edit",
                                label: EXIT_CONFIG_TEXT.edit,
                                onSelect: () => {
                                  setError(null);
                                  setDraft({
                                    id: c.id,
                                    stageCode: c.stageCode,
                                    kind: c.kind,
                                    name: c.name,
                                    roles: Array.isArray(c.param.roles) ? (c.param.roles as string[]) : [],
                                    days: Number(c.param.days ?? 30),
                                    slot: String(c.param.slot ?? "pain"),
                                  });
                                },
                              },
                              { id: "delete", label: EXIT_CONFIG_TEXT.remove, onSelect: () => setRemoving(c) },
                            ]}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </PanelList>
              )}
            </PanelCard>
          );
        })}
      </div>

      <DialogForm
        open={draft !== null}
        onOpenChange={(o) => (o ? null : setDraft(null))}
        title={draft?.id ? EXIT_CONFIG_TEXT.editTitle : EXIT_CONFIG_TEXT.addTitle}
        submitLabel={EXIT_CONFIG_TEXT.save}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {draft ? (
          <>
            <Field>
              <FieldLabel htmlFor="exit-kind">{EXIT_CONFIG_TEXT.kindLabel}</FieldLabel>
              <NativeSelect
                id="exit-kind"
                value={draft.kind}
                disabled={pending || draft.id !== undefined}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as ExitCriterionKind })}
              >
                {EXIT_CRITERION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {EXIT_CONFIG_TEXT.kind[k]}
                  </option>
                ))}
              </NativeSelect>
              {draft.id ? <FieldDescription>{EXIT_CONFIG_TEXT.kindLocked}</FieldDescription> : null}
            </Field>
            {draft.kind === "role_present" || draft.kind === "role_reached" ? (
              <Field>
                <FieldLabel>{EXIT_CONFIG_TEXT.rolesLabel}</FieldLabel>
                <div className="flex flex-wrap gap-md">
                  {CRITERION_ROLES.map((r) => (
                    <Label key={r} className="flex items-center gap-xs">
                      <Checkbox
                        checked={draft.roles.includes(r)}
                        disabled={pending}
                        onCheckedChange={(v) =>
                          setDraft({ ...draft, roles: v ? [...draft.roles, r] : draft.roles.filter((x) => x !== r) })
                        }
                      />
                      {DECISION_ROLE_LABEL[r] ?? r}
                    </Label>
                  ))}
                </div>
                {draft.kind === "role_present" ? <FieldDescription>{EXIT_CONFIG_TEXT.rolesAnyone}</FieldDescription> : null}
              </Field>
            ) : null}
            {draft.kind === "role_reached" ? (
              <Field>
                <FieldLabel htmlFor="exit-days">{EXIT_CONFIG_TEXT.daysLabel}</FieldLabel>
                <Input
                  id="exit-days"
                  type="number"
                  min={1}
                  max={365}
                  value={draft.days}
                  disabled={pending}
                  onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })}
                />
              </Field>
            ) : null}
            {draft.kind === "slot_filled" ? (
              <Field>
                <FieldLabel htmlFor="exit-slot">{EXIT_CONFIG_TEXT.slotLabel}</FieldLabel>
                <NativeSelect id="exit-slot" value={draft.slot} disabled={pending} onChange={(e) => setDraft({ ...draft, slot: e.target.value })}>
                  {EVIDENCE_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {DEAL_PAGE_TEXT.evidenceSlot[s] ?? s}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="exit-name">{EXIT_CONFIG_TEXT.nameLabel}</FieldLabel>
              <Input id="exit-name" value={draft.name} maxLength={255} disabled={pending} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <FieldDescription>{EXIT_CONFIG_TEXT.nameHint}</FieldDescription>
            </Field>
            {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
          </>
        ) : null}
      </DialogForm>

      {removing ? (
        <ConfirmDestructive
          open
          onOpenChange={(o) => (o ? null : setRemoving(null))}
          verb={EXIT_CONFIG_TEXT.remove}
          titleTemplate={EXIT_CONFIG_TEXT.removeTitle}
          target={removing.name}
          consequence={EXIT_CONFIG_TEXT.removeConsequence}
          onConfirm={async () => {
            const r = await onDelete(removing.id);
            if (!r.ok) setError(EXIT_CRITERION_ERROR[r.error ?? "denied"] ?? EXIT_CRITERION_ERROR.denied ?? null);
            setRemoving(null);
          }}
        />
      ) : null}
    </Section>
  );
}
