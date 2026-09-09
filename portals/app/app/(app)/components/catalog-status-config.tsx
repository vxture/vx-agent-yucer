"use client";

import { Field, FieldLabel, Input } from "@vxture/design-ui";
import type { ProductRecord, ProductStatusRecord } from "../../domains/catalog/store";
import { isSystemStatus } from "../../domains/catalog/lib/status-vocab";
import { statusTone } from "./status-label";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 产品状态 - the config page's OTHER independent vocabulary (owner ruling
// 2026-09-05: 状态是状态 - this file and the type config import nothing from
// each other). A status describes ONLY what stage a product is at; the rows
// themselves are the content, and a status has no status of its own.
//
// COLUMNS AS RULED: 序号 | 状态名称 | 关联产品 | 状态描述 | 操作(右侧锁定).
// The code rides the title line as a coloured tag - its colour says which
// lifecycle stage it is - rather than printing underneath as the other
// vocabularies do; printed both ways it would appear twice.
//
// NO 停用/启用: this table has no enablement to toggle. The three canonical
// rows never offer 删除 - not greyed, absent - because the roster and its
// 上线/退役 operations are wired to them and the rule refuses in every world.
// Added rows take the full set.

type Extra = { description: string };

export interface CatalogStatusConfigProps {
  readonly statuses: readonly ProductStatusRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    statusCode: string;
    name: string;
    description?: string | null;
  }) => Promise<VocabularyResult>;
  readonly onMove: (id: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}

export function CatalogStatusConfig({
  statuses,
  products,
  onSave,
  onMove,
  onDelete,
}: CatalogStatusConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const rows = statuses.map((r) => ({ ...r, code: r.statusCode }));
  const inUse = (statusId: string) => products.filter((p) => p.statusId === statusId).length;

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="status"
      errors={CATALOG_ERROR}
      text={{
        title: CATALOG_TEXT.statusesTitle,
        noun: CATALOG_TEXT.statusNoun,
        why: CATALOG_TEXT.statusesWhy,
        add: CATALOG_TEXT.addStatus,
        save: CATALOG_TEXT.saveStatus,
        codeLabel: CATALOG_TEXT.statusCode,
        codeHint: CATALOG_TEXT.statusCodeHint,
        nameLabel: CATALOG_TEXT.colStatusName,
        colName: CATALOG_TEXT.colStatusName,
        deleteConsequence: CATALOG_TEXT.statusDeleteConsequence,
      }}
      nameSuffix={(r) => <Tag tone={statusTone(r)}>{r.statusCode}</Tag>}
      columns={[
        {
          id: "linked",
          header: CATALOG_TEXT.colLinkedProducts,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{CATALOG_TEXT.linkedCount(inUse(r.id))}</span>,
        },
        {
          id: "description",
          header: CATALOG_TEXT.colStatusDesc,
          width: "lg",
          cell: (r) => <span className="text-muted-foreground text-body-sm">{r.description ?? ""}</span>,
        },
      ]}
      sortOn={{ linked: (r) => inUse(r.id) }}
      deleteHiddenWhen={(r) => isSystemStatus(r.statusCode)}
      extraDefaults={{ description: "" } as Extra}
      extraFromRow={(r) => ({ description: r.description ?? "" })}
      renderExtra={(v, set, disabled) => (
        <Field>
          <FieldLabel htmlFor="status-desc">{CATALOG_TEXT.colStatusDesc}</FieldLabel>
          <Input
            id="status-desc"
            value={v.description}
            disabled={disabled}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
      )}
      onSave={(input) =>
        onSave({
          statusCode: input.code,
          name: input.name,
          description: input.description.trim() || null,
        })
      }
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
