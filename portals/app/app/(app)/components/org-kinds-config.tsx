"use client";

import { useMessages } from "../lib/i18n/provider";
import { moveOrgKindAction, removeOrgKindAction, saveOrgKindAction } from "../admin/org/actions";
import { VocabularyConfig } from "./vocabulary-config";

/* 单位类型 - the workspace's own list of what a unit can be (incr/0051).
 *
 * 总部 / 事业部 / 大区 / 分公司 / 团队 are shipped; a 中心 or a 办事处 is one
 * row here. Anchor code, name, order, a count of the units of that kind, and
 * a delete refused while any exist - exactly what VocabularyConfig draws.
 */
export interface OrgKindRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly units: number;
}

export function OrgKindsConfig({ rows }: { readonly rows: readonly OrgKindRow[] }) {
  const { ORG_ERROR, ORG_KIND_TEXT } = useMessages();
  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="org-kind"
      errors={ORG_ERROR}
      page={{ icon: "tree-structure", count: ORG_KIND_TEXT.count }}
      text={{
        title: ORG_KIND_TEXT.title,
        noun: ORG_KIND_TEXT.noun,
        why: ORG_KIND_TEXT.why,
        add: ORG_KIND_TEXT.add,
        save: ORG_KIND_TEXT.save,
        codeLabel: ORG_KIND_TEXT.codeLabel,
        codeHint: ORG_KIND_TEXT.codeHint,
        nameLabel: ORG_KIND_TEXT.nameLabel,
        colName: ORG_KIND_TEXT.colName,
        deleteConsequence: ORG_KIND_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "units",
          sortable: true,
          header: ORG_KIND_TEXT.colUnits,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{r.units}</span>,
        },
      ]}
      sortOn={{ units: (r) => r.units }}
      deletableWhen={(r) => r.units === 0}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => saveOrgKindAction({ code: input.code, name: input.name })}
      onMove={(id, direction) => moveOrgKindAction(id, direction)}
      onDelete={(id) => removeOrgKindAction(id)}
    />
  );
}
