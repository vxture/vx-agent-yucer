"use client";

import { TableTitleCell, cn, type DataTableColumn, type DataTableProps, type TableTitleCellProps } from "@vxture/design-ui";
import { DataTable } from "./business-controls";
import styles from "./collection-table.module.css";

type Track = "direction" | "subject" | "criteria" | "reference" | "category" | "count" | "unit" | "state" | "composition" | "price" | "amount";
type Column<Row> = Omit<DataTableColumn<Row>, "width"> & { readonly track?: Track };

export function CollectionTitleCell(props: Omit<TableTitleCellProps, "size">) {
  return <TableTitleCell {...props} size="lg" />;
}

export function CollectionTable<Row>({ columns, className, ...props }: Omit<DataTableProps<Row>, "columns"> & {
  readonly columns: readonly Column<Row>[];
}) {
  return <DataTable {...props} className={cn(styles.table, className)} columns={columns.map(({ track, header, ...column }, index) => ({
    ...column,
    header: <span data-collection-track={track} data-collection-align={column.align ?? (index === 0 ? "left" : "center")}>{header}</span>,
  }))} />;
}
