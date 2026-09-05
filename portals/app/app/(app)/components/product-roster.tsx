"use client";

import { useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  EmptyState,
  Icon,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord, ProductTypeRecord } from "../../domains/catalog/store";
import type { StatusVocabRow } from "../../domains/catalog/lib/lifecycle";
import { BEHAVIOR_TONE, statusLabelOf } from "./status-label";
import { useMessages } from "../lib/i18n/provider";

// The module page's roster - owner ruling 2026-09-05: the page is DISPLAY, the
// row is where the operations live, locked to the right.
//
// Columns exactly as ruled: 序号 | 名称(主)+编码(副) | 类型 | 状态 | 计价单位 |
// 操作. Two rosters: the live one (on sale + in development, in catalogue
// order) and the retired one below it - retirement is shelving, so the shelf
// is visible but secondary.
//
// ROW OPERATIONS live in ONE ActionMenu per row: the DS row-action column is
// fixed at 64px and holds a single trigger by design, so a row of buttons is
// not an option there. The status items are only the LEGAL moves (the
// lifecycle map's, not a full list the service would refuse), and 删除 is the
// DS danger item with its consequence spelled out - the confirm dialog is the
// DS's own. Sorting IS still one-click somewhere: the 新建 page's sort variant
// puts the arrows in a regular column, because sorting is a burst activity
// and that page is the one the ruling names for it (新建与排序同一页面).
//
// FAILURES GO TO A TOAST, the lifecycle-control argument: a violation is an
// event, not a property of the row, and a 56px cell cannot hold a sentence.

export interface ProductRosterProps {
  readonly products: readonly ProductRecord[];
  readonly types: readonly ProductTypeRecord[];
  /** The merged status vocabulary - labels, tones and legal moves all read it. */
  readonly statuses: readonly StatusVocabRow[];
  readonly canWrite: boolean;
  /** "sort" renders only the live roster with the move arrows - the 新建 page
   * mounts it beside the create form so a new product can be put in place. */
  readonly variant?: "full" | "sort";
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onStatus: (id: string, status: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function ProductRoster({
  products,
  types,
  statuses,
  canWrite,
  variant = "full",
  onMove,
  onStatus,
  onDelete,
}: ProductRosterProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const vocab = new Map(statuses.map((r) => [r.statusCode, r]));
  const behaviorOf = (code: string) => vocab.get(code)?.behavior ?? "active";
  const live = products.filter((p) => behaviorOf(p.status) !== "retired");
  const retired = products.filter((p) => behaviorOf(p.status) === "retired");

  /** The legal targets for one product - the mirror of planStatusMove: an
   * enabled row, a different code, and never INTO development from outside
   * it. Offering an illegal move would be offering a refusal. */
  const targetsFor = (p: ProductRecord) =>
    statuses.filter(
      (r) =>
        r.statusCode !== p.status &&
        r.status === "active" &&
        (r.behavior !== "in_development" || behaviorOf(p.status) === "in_development"),
    );

  /** The crafted verbs for the three system moves; a generic 转入 otherwise. */
  const moveLabel = (p: ProductRecord, to: StatusVocabRow) => {
    const label = statusLabelOf(to, CATALOG_TEXT);
    if (to.statusCode === "active" && behaviorOf(p.status) === "in_development")
      return CATALOG_TEXT.opLaunch;
    if (to.statusCode === "active" && behaviorOf(p.status) === "retired")
      return CATALOG_TEXT.opReinstate;
    if (to.statusCode === "retired") return CATALOG_TEXT.opRetire;
    return CATALOG_TEXT.moveToStatus(label);
  };

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({
          tone: "danger",
          title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied,
        });
      });
    });

  const columns = [
    {
      id: "name",
      header: CATALOG_TEXT.colName,
      cell: (r: ProductRecord) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate">{r.name}</span>
          <span className="text-muted-foreground mono truncate text-body-sm">{r.productCode}</span>
        </span>
      ),
    },
    {
      id: "type",
      header: CATALOG_TEXT.colType,
      cell: (r: ProductRecord) =>
        r.typeId ? (typeName.get(r.typeId) ?? CATALOG_TEXT.noCategory) : CATALOG_TEXT.noCategory,
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      cell: (r: ProductRecord) => {
        const row = vocab.get(r.status);
        return (
          <StatusBadge tone={row ? BEHAVIOR_TONE[row.behavior] : "neutral"}>
            {row ? statusLabelOf(row, CATALOG_TEXT) : r.status}
          </StatusBadge>
        );
      },
    },
    { id: "unit", header: CATALOG_TEXT.colUnitPrice, cell: (r: ProductRecord) => r.unit },
  ];

  /** One menu per row - the DS's single-trigger row-action column. */
  const rowActions = canWrite
    ? (row: ProductRecord, rowIndex: number) => {
        const list = behaviorOf(row.status) === "retired" ? retired : live;
        return (
          <ActionMenu
            disabled={pending}
            items={[
              {
                id: "edit",
                label: CATALOG_TEXT.opEdit,
                onSelect: () => {
                  window.location.href = `/catalog/new?code=${encodeURIComponent(row.productCode)}`;
                },
              },
              ...targetsFor(row).map((to) => ({
                id: to.statusCode,
                label: moveLabel(row, to),
                onSelect: () => run(onStatus(row.id, to.statusCode)),
              })),
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(row.id, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === list.length - 1,
                onSelect: () => run(onMove(row.id, "down")),
              },
              {
                id: "delete",
                label: CATALOG_TEXT.opDelete,
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: CATALOG_TEXT.opDelete,
                  target: row.name,
                  consequence: CATALOG_TEXT.deleteConsequence,
                  onConfirm: () => run(onDelete(row.id)),
                },
              },
            ]}
          />
        );
      }
    : undefined;

  /** The sort page's arrows: a REGULAR column, not the 64px action slot -
   * sorting is a burst activity and each step must stay one click. */
  const arrowColumn = {
    id: "order",
    header: CATALOG_TEXT.colOps,
    cell: (r: ProductRecord, rowIndex: number) => (
      <span className="flex items-center gap-xs">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={CATALOG_TEXT.opUp}
          title={CATALOG_TEXT.opUp}
          disabled={pending || rowIndex === 0}
          onClick={() => run(onMove(r.id, "up"))}
        >
          <Icon name="chevron-up" size="sm" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={CATALOG_TEXT.opDown}
          title={CATALOG_TEXT.opDown}
          disabled={pending || rowIndex === live.length - 1}
          onClick={() => run(onMove(r.id, "down"))}
        >
          <Icon name="chevron-down" size="sm" />
        </Button>
      </span>
    ),
  };

  const table = (rows: readonly ProductRecord[], extra?: typeof arrowColumn) => (
    <DataTable
      labels={DATA_TABLE_LABELS}
      indexStart={1}
      rowKey={(r: ProductRecord) => r.id}
      rows={[...rows]}
      columns={extra ? [...columns, extra] : columns}
      rowActions={extra ? undefined : rowActions}
      empty={
        <EmptyState title={CATALOG_TEXT.rosterLive} description={CATALOG_TEXT.byTypeEmpty} />
      }
    />
  );

  if (variant === "sort") {
    return (
      <Section icon="stack" title={CATALOG_TEXT.sortTitle} description={CATALOG_TEXT.sortWhy}>
        {table(live, canWrite ? arrowColumn : undefined)}
      </Section>
    );
  }

  return (
    <>
      <Section
        id="products"
        icon="stack"
        title={CATALOG_TEXT.rosterLive}
        description={CATALOG_TEXT.rosterLiveWhy}
        action={
          canWrite ? (
            <Button asChild>
              <a href="/catalog/new">{CATALOG_TEXT.newProduct}</a>
            </Button>
          ) : undefined
        }
      >
        {table(live)}
      </Section>

      {retired.length > 0 ? (
        <Section
          id="retired"
          icon="package"
          title={CATALOG_TEXT.rosterRetired}
          description={CATALOG_TEXT.rosterRetiredWhy}
        >
          {table(retired)}
        </Section>
      ) : null}
    </>
  );
}
