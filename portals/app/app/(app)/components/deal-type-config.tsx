"use client";

import type { DealTypeRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 商机类型 - the workspace's own classification axis (incr/0060-0061).
//
// WHY IT IS A VOCABULARY, AND A NEW ONE. `opportunity` never carried a
// type/kind/category column before this increment - every deal in the
// product has been the same shape whether it is a brand-new logo, a renewal,
// an expansion, or a project vs. a product sale. The shipped five mix
// commercial motion (新签/续费/增购) and delivery form (项目型/产品型) on
// purpose, the same one-flat-list simplification every vocabulary here makes.
//
// DELETION IS REFUSED WHILE OPPORTUNITIES ARE FILED UNDER IT, the same shape
// IndustryConfig uses: re-file those deals and the row becomes deletable.

export function DealTypeConfig({
  dealTypes,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly dealTypes: readonly DealTypeRecord[];
  /** How many opportunities are filed under each type, by id. */
  readonly usage: Readonly<Record<string, number>>;
  /** `pipeline.dealType.manage` - the page checks this, this panel only renders it. */
  readonly editable: boolean;
  readonly onSave: (input: { code: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (dealTypeId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (dealTypeId: string) => Promise<VocabularyResult>;
}) {
  const { DEAL_TYPE_ERROR, DEAL_TYPE_TEXT } = useMessages();
  const rows = dealTypes.map((r) => ({ ...r, code: r.dealTypeCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="dtp"
      errors={DEAL_TYPE_ERROR}
      editable={editable}
      icon="tree-structure"
      text={{
        title: DEAL_TYPE_TEXT.title,
        noun: DEAL_TYPE_TEXT.noun,
        why: DEAL_TYPE_TEXT.why,
        add: DEAL_TYPE_TEXT.add,
        save: DEAL_TYPE_TEXT.save,
        codeLabel: DEAL_TYPE_TEXT.codeLabel,
        codeHint: DEAL_TYPE_TEXT.codeHint,
        nameLabel: DEAL_TYPE_TEXT.nameLabel,
        colName: DEAL_TYPE_TEXT.colName,
        deleteConsequence: DEAL_TYPE_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: DEAL_TYPE_TEXT.colFiled,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ filed: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => onSave({ code: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
