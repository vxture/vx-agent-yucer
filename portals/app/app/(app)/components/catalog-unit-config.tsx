"use client";

import type { ProductRecord, ProductUnitRecord } from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import type { MoveDirection } from "../../domains/shared/ordering";

// 计价单位 - 产品配置's third INDEPENDENT vocabulary (incr/0037), added on the
// owner's instruction of 2026-09-08. Same rule as the other two: this file and
// the type/status configs import nothing from each other. Sharing the TABLE
// they are all drawn in is not sharing the vocabulary - see vocabulary-config.
//
// WHY IT IS CONFIGURED AT ALL. `unit` was a free-text field on the product
// form, and every quote line multiplies quantity by unit price - so 套 typed
// by one person and 台 typed by another are two units nobody can group by, and
// "12 × ¥8,000" means nothing until you know what one of them is.
//
// NO STATE COLUMN, unlike the type. A retired type still describes the
// products that carry it; a unit that stopped being offered is either still
// what those products are priced in, or they need repricing - and neither is
// a state the vocabulary can hold. So the columns are 序号 | 单位名称 |
// 关联产品 | 操作, and deletion is refused while anything is priced in it.

export interface CatalogUnitConfigProps {
  readonly units: readonly ProductUnitRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: { unitCode: string; name: string }) => Promise<VocabularyResult>;
  readonly onMove: (id: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}

export function CatalogUnitConfig({
  units,
  products,
  onSave,
  onMove,
  onDelete,
}: CatalogUnitConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const rows = units.map((u) => ({ ...u, code: u.unitCode }));
  const inUse = (unitId: string) => products.filter((p) => p.unitId === unitId).length;

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="unit"
      errors={CATALOG_ERROR}
      text={{
        title: CATALOG_TEXT.unitsTitle,
        noun: "单位",
        why: CATALOG_TEXT.unitsWhy,
        add: CATALOG_TEXT.addUnit,
        save: CATALOG_TEXT.saveUnit,
        codeLabel: CATALOG_TEXT.unitCode,
        codeHint: CATALOG_TEXT.unitCodeHint,
        nameLabel: CATALOG_TEXT.colUnitName,
        colName: CATALOG_TEXT.colUnitName,
        deleteConsequence: CATALOG_TEXT.unitDeleteConsequence,
      }}
      columns={[
        {
          id: "linked",
          header: CATALOG_TEXT.colLinkedProducts,
          width: "sm",
          cell: (u) => (
            <span className="tabular-nums">{CATALOG_TEXT.linkedCount(inUse(u.id))}</span>
          ),
        },
      ]}
      sortOn={{ linked: (u) => inUse(u.id) }}
      extraDefaults={{}}
      extraFromRow={() => ({})}
      onSave={(input) => onSave({ unitCode: input.code, name: input.name })}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
