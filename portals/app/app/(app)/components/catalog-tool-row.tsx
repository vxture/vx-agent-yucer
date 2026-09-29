"use client";

import { EmptyState, NativeSelect } from "@vxture/design-ui";
import { FilterSlot } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { ProductTypeRecord } from "../../domains/catalog/store";

// The pieces the three catalogue rosters' tool rows share (owner, 2026-09-29:
// 产品定价 / 解决方案 / 产品目录 narrow the same way). One copy, so the
// 产品类型 control cannot drift between pages that promise to be the same.

/** 产品类型 - the catalogue's type vocabulary as a FilterBar dropdown. */
export function TypeFilter({
  types,
  value,
  onChange,
}: {
  readonly types: readonly ProductTypeRecord[];
  readonly value: string;
  readonly onChange: (typeId: string) => void;
}) {
  const { CATALOG_TEXT } = useMessages();
  return (
    <FilterSlot width="w-[9rem]">
      <NativeSelect
        value={value}
        aria-label={CATALOG_TEXT.filterAllTypes}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{CATALOG_TEXT.filterAllTypes}</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </NativeSelect>
    </FilterSlot>
  );
}

/** The card view's empty state: "no match" while narrowed, the roster's own
 * explanation otherwise - the same two answers the table's `empty` gives. */
export function CardsEmpty({
  narrowed,
  title,
  description,
}: {
  readonly narrowed: boolean;
  readonly title: string;
  readonly description: string;
}) {
  const { TABLE_TOOLBAR_TEXT } = useMessages();
  return narrowed ? (
    <EmptyState title={TABLE_TOOLBAR_TEXT.noMatch} description={TABLE_TOOLBAR_TEXT.noMatchWhy} />
  ) : (
    <EmptyState title={title} description={description} />
  );
}
