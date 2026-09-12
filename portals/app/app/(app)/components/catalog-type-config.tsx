"use client";

import { StatusBadge } from "@vxture/design-ui";
import type { ProductRecord, ProductTypeRecord } from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 产品类型 - one of the config page's INDEPENDENT vocabularies (owner ruling
// 2026-09-05: 类型是类型，状态是状态 - this file and the status config import
// nothing from each other; both draw the same table, which is a different
// thing). A type describes what KIND of product something is and carries its
// own effective/retired state; it knows nothing of product status.
//
// COLUMNS AS RULED: 序号 | 类型名称 | 关联产品 | 类型状态 | 操作(右侧锁定).
//
// THE ONE OPERATION ONLY THIS VOCABULARY HAS: 停用 / 启用. A type in use is
// not deleted, it is retired - it keeps rendering on the products that carry
// it and stops being offered to new ones. Delete stays offered on every row
// and the rule refuses it while products carry the type; the count column is
// what makes that refusal predictable.

export interface CatalogTypeConfigProps {
  readonly types: readonly ProductTypeRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    typeCode: string;
    name: string;
    status?: "active" | "retired";
  }) => Promise<VocabularyResult>;
  readonly onMove: (id: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}

export function CatalogTypeConfig({
  types,
  products,
  onSave,
  onMove,
  onDelete,
}: CatalogTypeConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const rows = types.map((t) => ({ ...t, code: t.typeCode }));
  const inUse = (typeId: string) => products.filter((p) => p.typeId === typeId).length;

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="type"
      /* squares-four, not package/cube (owner: 产品配置页头跟产品类型这两个
         相邻标题图标撞了 - 都是"箱子"轮廓，视觉上分不清). 网格代表"分类"，
         跟页头的 cube、跟下面产品状态的 flag、计价单位的 gauge 都不撞。 */
      icon="squares-four"
      errors={CATALOG_ERROR}
      text={{
        title: CATALOG_TEXT.typesTitle,
        noun: CATALOG_TEXT.typeNoun,
        why: CATALOG_TEXT.typesWhy,
        add: CATALOG_TEXT.addType,
        save: CATALOG_TEXT.saveType,
        codeLabel: CATALOG_TEXT.typeCode,
        codeHint: CATALOG_TEXT.typeCodeHint,
        nameLabel: CATALOG_TEXT.colTypeName,
        colName: CATALOG_TEXT.colTypeName,
        deleteConsequence: CATALOG_TEXT.typeDeleteConsequence,
      }}
      columns={[
        {
          id: "linked",
          header: CATALOG_TEXT.colLinkedProducts,
          width: "sm",
          cell: (t) => <span className="tabular-nums">{CATALOG_TEXT.linkedCount(inUse(t.id))}</span>,
        },
        {
          id: "status",
          header: CATALOG_TEXT.colTypeStatus,
          width: "lg",
          cell: (t) =>
            t.status === "retired" ? (
              <Tag>{CATALOG_TEXT.typeRetiredBadge}</Tag>
            ) : (
              <StatusBadge tone="success">{CATALOG_TEXT.typeEffectiveBadge}</StatusBadge>
            ),
        },
      ]}
      sortOn={{ linked: (t) => inUse(t.id) }}
      extraActions={(t, run) => [
        {
          id: "toggle",
          label: t.status === "active" ? CATALOG_TEXT.typeRetire : CATALOG_TEXT.typeReinstate,
          onSelect: () =>
            run(
              onSave({
                typeCode: t.typeCode,
                name: t.name,
                status: t.status === "active" ? "retired" : "active",
              }),
            ),
        },
      ]}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      /* The dialog never sends `status`: a rename keeps whatever the row has,
         and the toggle above is the only path that changes it. */
      onSave={(input) => onSave({ typeCode: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
