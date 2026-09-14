"use client";

import type { ContractTypeRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 签约类型 - what kind of transaction a deal is (incr/0067).
//
// ONE OF THE TWO SECTIONS 商机类型 BECAME. The old single list answered two
// questions at once - what kind of deal this is, and what is being sold - so a
// rep picking "项目型" had said nothing about whether it was new business, and
// a rep picking "续费" had said nothing about what they were renewing. This
// section holds the first question; business-form-config.tsx holds the second.
//
// NO EXTRA FIELD. The stall-days override that used to live on this list moved
// to 业务形态 with the split: how long a deal may sit at one stage is a fact
// about delivery complexity, not about whether it is a renewal.

export function ContractTypeConfig({
  contractTypes,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly contractTypes: readonly ContractTypeRecord[];
  readonly usage: Readonly<Record<string, number>>;
  readonly editable: boolean;
  readonly onSave: (input: { code: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (contractTypeId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (contractTypeId: string) => Promise<VocabularyResult>;
}) {
  const { CONTRACT_TYPE_ERROR, CONTRACT_TYPE_TEXT } = useMessages();
  const rows = contractTypes.map((r) => ({ ...r, code: r.contractTypeCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="ctp"
      errors={CONTRACT_TYPE_ERROR}
      editable={editable}
      icon="tree-structure"
      text={{
        title: CONTRACT_TYPE_TEXT.title,
        noun: CONTRACT_TYPE_TEXT.noun,
        why: CONTRACT_TYPE_TEXT.why,
        add: CONTRACT_TYPE_TEXT.add,
        save: CONTRACT_TYPE_TEXT.save,
        codeLabel: CONTRACT_TYPE_TEXT.codeLabel,
        codeHint: CONTRACT_TYPE_TEXT.codeHint,
        nameLabel: CONTRACT_TYPE_TEXT.nameLabel,
        colName: CONTRACT_TYPE_TEXT.colName,
        deleteConsequence: CONTRACT_TYPE_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: CONTRACT_TYPE_TEXT.colFiled,
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
