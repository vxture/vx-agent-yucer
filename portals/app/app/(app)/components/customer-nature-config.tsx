"use client";

import type { CustomerNatureRecord } from "../../domains/account/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 客户性质 - 客户分类's fourth vocabulary (incr/0072).
//
// WHAT KIND OF ORGANISATION THIS IS - government / SOE / private / foreign -
// distinct from 客户类型 (how we sell to it) and 行业 (what it does). A
// government account's procurement process and required qualifications are
// nothing like a private company's, regardless of either of the other two.
//
// DELETION IS REFUSED WHILE CUSTOMERS ARE FILED UNDER IT, same as the other
// three sections on this page.

export function CustomerNatureConfig({
  customerNatures,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly customerNatures: readonly CustomerNatureRecord[];
  /** How many customers are filed under each nature, by id. */
  readonly usage: Readonly<Record<string, number>>;
  /** `account.upsert` - the page checks this, this panel only renders it. */
  readonly editable: boolean;
  readonly onSave: (input: { customerNatureCode: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (customerNatureId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (customerNatureId: string) => Promise<VocabularyResult>;
}) {
  const { CUSTOMER_NATURE_ERROR, CUSTOMER_NATURE_TEXT } = useMessages();
  const rows = customerNatures.map((r) => ({ ...r, code: r.customerNatureCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="cnt"
      icon="seal-check"
      errors={CUSTOMER_NATURE_ERROR}
      editable={editable}
      text={{
        title: CUSTOMER_NATURE_TEXT.configTitle,
        noun: CUSTOMER_NATURE_TEXT.noun,
        why: CUSTOMER_NATURE_TEXT.configWhy,
        add: CUSTOMER_NATURE_TEXT.add,
        save: CUSTOMER_NATURE_TEXT.save,
        codeLabel: CUSTOMER_NATURE_TEXT.code,
        codeHint: CUSTOMER_NATURE_TEXT.codeHint,
        nameLabel: CUSTOMER_NATURE_TEXT.name,
        colName: CUSTOMER_NATURE_TEXT.colName,
        deleteConsequence: CUSTOMER_NATURE_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: CUSTOMER_NATURE_TEXT.colFiled,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ filed: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => onSave({ customerNatureCode: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
