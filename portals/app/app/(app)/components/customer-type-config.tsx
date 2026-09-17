"use client";

import type { CustomerTypeRecord } from "../../domains/account/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 客户类型 - 客户分类's second vocabulary (incr/0071).
//
// WHO OWNS THE RELATIONSHIP AND HOW A DEAL IS PRICED is what this tells
// apart - a channel-sold account and a directly-sold one are not
// interchangeable rows in a pipeline report.
//
// DELETION IS REFUSED WHILE CUSTOMERS ARE FILED UNDER IT, same way as 行业分类
// beside it - the count is on the row so the refusal is predictable.

export function CustomerTypeConfig({
  customerTypes,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly customerTypes: readonly CustomerTypeRecord[];
  /** How many customers are filed under each type, by id. */
  readonly usage: Readonly<Record<string, number>>;
  /** `account.upsert` - the page checks this, this panel only renders it. */
  readonly editable: boolean;
  readonly onSave: (input: { customerTypeCode: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (customerTypeId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (customerTypeId: string) => Promise<VocabularyResult>;
}) {
  const { CUSTOMER_TYPE_ERROR, CUSTOMER_TYPE_TEXT } = useMessages();
  const rows = customerTypes.map((r) => ({ ...r, code: r.customerTypeCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="cty"
      icon="squares-four"
      errors={CUSTOMER_TYPE_ERROR}
      editable={editable}
      text={{
        title: CUSTOMER_TYPE_TEXT.configTitle,
        noun: CUSTOMER_TYPE_TEXT.noun,
        why: CUSTOMER_TYPE_TEXT.configWhy,
        add: CUSTOMER_TYPE_TEXT.add,
        save: CUSTOMER_TYPE_TEXT.save,
        codeLabel: CUSTOMER_TYPE_TEXT.code,
        codeHint: CUSTOMER_TYPE_TEXT.codeHint,
        nameLabel: CUSTOMER_TYPE_TEXT.name,
        colName: CUSTOMER_TYPE_TEXT.colName,
        deleteConsequence: CUSTOMER_TYPE_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: CUSTOMER_TYPE_TEXT.colFiled,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ filed: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => onSave({ customerTypeCode: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
