"use client";

import type { IndustryRecord } from "../../domains/account/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 行业分类 - the workspace's own list (incr/0040).
//
// WHY IT IS CONFIGURED AT ALL. It was a free-text column with no list behind
// it: 制造 on one customer and 制造业 on the next are two industries to every
// group-by in the product, and a market segment whose criteria name one of
// them silently stops matching the other. Nothing reported that, because
// nothing could tell a typo from a new industry.
//
// DELETION IS REFUSED WHILE CUSTOMERS ARE FILED UNDER IT, and unlike a
// win/loss reason that refusal has a way out: re-file those customers and the
// row becomes deletable. The count is on the row so the refusal is predictable
// before it is met.

export function IndustryConfig({
  industries,
  usage,
  onSave,
  onMove,
  onDelete,
}: {
  readonly industries: readonly IndustryRecord[];
  /** How many customers are filed under each industry, by id. */
  readonly usage: Readonly<Record<string, number>>;
  readonly onSave: (input: { industryCode: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (industryId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (industryId: string) => Promise<VocabularyResult>;
}) {
  const { INDUSTRY_ERROR, INDUSTRY_TEXT } = useMessages();
  const rows = industries.map((r) => ({ ...r, code: r.industryCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="ind"
      errors={INDUSTRY_ERROR}
      page={{ icon: "buildings", count: INDUSTRY_TEXT.count }}
      text={{
        title: INDUSTRY_TEXT.configTitle,
        noun: INDUSTRY_TEXT.noun,
        why: INDUSTRY_TEXT.configWhy,
        add: INDUSTRY_TEXT.add,
        save: INDUSTRY_TEXT.save,
        codeLabel: INDUSTRY_TEXT.code,
        codeHint: INDUSTRY_TEXT.codeHint,
        nameLabel: INDUSTRY_TEXT.name,
        colName: INDUSTRY_TEXT.colName,
        deleteConsequence: INDUSTRY_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "filed",
          sortable: true,
          header: INDUSTRY_TEXT.colFiled,
          width: "sm",
          // A short count: centred by default, not padded into a numeric block.
          
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ filed: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => onSave({ industryCode: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
