"use client";

import { Field, FieldDescription, FieldLabel, Input } from "@vxture/design-ui";
import type { BusinessFormRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 业务形态 - what is being sold (incr/0067).
//
// THE OTHER HALF OF THE OLD 商机类型. 项目定制类/标化产品类/咨询服务类 replace
// the old 项目型/产品型 pair, and the third is new: advisory work is neither a
// bespoke build nor a catalogue sale, and workspaces that sell it had to file
// it under whichever of the two lied least.
//
// THE STALL OVERRIDE LIVES HERE NOW (it was on 商机类型 since incr/0062). Two
// writes behind one dialog, the same shape this section has always had: the
// rename goes through its own gated verb, then the override through its own.
// Both check the same /admin/opportunity permission since incr/0063, so the
// pair cannot half-succeed for a permission reason - only for a stale row.

type Extra = { stallDaysOverride: number | null };

export function BusinessFormConfig({
  businessForms,
  usage,
  editable,
  workspaceStallDays,
  onSave,
  onSaveStallOverride,
  onMove,
  onDelete,
}: {
  readonly businessForms: readonly BusinessFormRecord[];
  readonly usage: Readonly<Record<string, number>>;
  readonly editable: boolean;
  readonly workspaceStallDays: number;
  readonly onSave: (
    input: { code: string; name: string },
  ) => Promise<VocabularyResult & { businessForm?: BusinessFormRecord }>;
  readonly onSaveStallOverride: (
    businessFormId: string,
    stallDaysOverride: number | null,
  ) => Promise<VocabularyResult>;
  readonly onMove: (businessFormId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (businessFormId: string) => Promise<VocabularyResult>;
}) {
  const { BUSINESS_FORM_ERROR, BUSINESS_FORM_TEXT } = useMessages();
  const rows = businessForms.map((r) => ({ ...r, code: r.businessFormCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="bfm"
      errors={BUSINESS_FORM_ERROR}
      editable={editable}
      icon="package"
      text={{
        title: BUSINESS_FORM_TEXT.title,
        noun: BUSINESS_FORM_TEXT.noun,
        why: BUSINESS_FORM_TEXT.why,
        add: BUSINESS_FORM_TEXT.add,
        save: BUSINESS_FORM_TEXT.save,
        codeLabel: BUSINESS_FORM_TEXT.codeLabel,
        codeHint: BUSINESS_FORM_TEXT.codeHint,
        nameLabel: BUSINESS_FORM_TEXT.nameLabel,
        colName: BUSINESS_FORM_TEXT.colName,
        deleteConsequence: BUSINESS_FORM_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: BUSINESS_FORM_TEXT.colFiled,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
        {
          id: "stallOverride",
          header: BUSINESS_FORM_TEXT.colStallOverride,
          width: "sm",
          cell: (r) => (
            <span className="tabular-nums">
              {r.stallDaysOverride ?? BUSINESS_FORM_TEXT.stallOverrideDefault(workspaceStallDays)}
            </span>
          ),
        },
      ]}
      sortOn={{ filed: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{ stallDaysOverride: null } as Extra}
      extraFromRow={(r) => ({ stallDaysOverride: r.stallDaysOverride })}
      renderExtra={(v, set, disabled) => (
        <Field>
          <FieldLabel>{BUSINESS_FORM_TEXT.stallOverrideLabel}</FieldLabel>
          <Input
            type="number"
            min={1}
            max={365}
            placeholder={BUSINESS_FORM_TEXT.stallOverrideDefault(workspaceStallDays)}
            value={v.stallDaysOverride ?? ""}
            disabled={disabled}
            onChange={(e) =>
              set({ stallDaysOverride: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <FieldDescription>{BUSINESS_FORM_TEXT.stallOverrideHint}</FieldDescription>
        </Field>
      )}
      onSave={async (input) => {
        const saved = await onSave({ code: input.code, name: input.name });
        if (!saved.ok) return saved;
        if (saved.businessForm) {
          const overrideResult = await onSaveStallOverride(
            saved.businessForm.id,
            input.stallDaysOverride,
          );
          if (!overrideResult.ok) return overrideResult;
        }
        return saved;
      }}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
