"use client";

import type { CustomerSizeRecord } from "../../domains/account/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 客户规模 - 客户分类's third vocabulary (incr/0071).
//
// NOT account.employeeCount - that is a raw headcount the customer reports;
// this is the band the workspace itself sells against (集团客户 gets a
// different playbook than 微型企业), a commercial call rather than a formula.
//
// DELETION IS REFUSED WHILE CUSTOMERS ARE FILED UNDER IT, same as the other
// two sections on this page.

export function CustomerSizeConfig({
  customerSizes,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly customerSizes: readonly CustomerSizeRecord[];
  /** How many customers are filed under each size, by id. */
  readonly usage: Readonly<Record<string, number>>;
  /** `account.upsert` - the page checks this, this panel only renders it. */
  readonly editable: boolean;
  readonly onSave: (input: { customerSizeCode: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (customerSizeId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (customerSizeId: string) => Promise<VocabularyResult>;
}) {
  const { CUSTOMER_SIZE_ERROR, CUSTOMER_SIZE_TEXT } = useMessages();
  const rows = customerSizes.map((r) => ({ ...r, code: r.customerSizeCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="csz"
      icon="scales"
      errors={CUSTOMER_SIZE_ERROR}
      editable={editable}
      text={{
        title: CUSTOMER_SIZE_TEXT.configTitle,
        noun: CUSTOMER_SIZE_TEXT.noun,
        why: CUSTOMER_SIZE_TEXT.configWhy,
        add: CUSTOMER_SIZE_TEXT.add,
        save: CUSTOMER_SIZE_TEXT.save,
        codeLabel: CUSTOMER_SIZE_TEXT.code,
        codeHint: CUSTOMER_SIZE_TEXT.codeHint,
        nameLabel: CUSTOMER_SIZE_TEXT.name,
        colName: CUSTOMER_SIZE_TEXT.colName,
        deleteConsequence: CUSTOMER_SIZE_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: CUSTOMER_SIZE_TEXT.colFiled,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ filed: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => onSave({ customerSizeCode: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
