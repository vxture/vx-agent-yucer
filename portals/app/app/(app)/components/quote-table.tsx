"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useListPagination,
  type DataTableColumn,
} from "@vxture/design-ui";
import { FilterSlot, PaginationFooter, RowActions, SearchSlot, useTableSort } from "./table-fittings";
import { LevelMedal, Tag } from "./tag";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { STAGE_TONE, formatMoney, stageLabelFor } from "../lib/view-model";
import {
  DEFAULT_STAGE_DEFINITIONS,
  type Stage,
  type StageDefinition,
} from "../../domains/pipeline/lib/stage";

// What we have actually offered, per deal.
//
// NOT A NEW OBJECT. A quote is the CURRENT STATE of an opportunity's lines -
// opportunity_line already carries quantity, unit price, amount and
// needs_approval, price_book_entry carries the floor those were judged
// against, and line_discount_approval carries the signature. All three existed
// and nothing put them together, so "what did we offer this customer" was a
// question the product could not answer without opening one deal at a time.
//
// Modelling a quote as its own row would have been worse than useless: two
// records of one offer that can disagree, and the line is the one the
// discount rule actually reads.
//
// THE COLUMN THAT MATTERS IS 待签字. A line below the floor raises
// needs_approval; an approval clears it. A quote with unsigned lines is not
// an offer yet - it is an offer waiting on somebody.
//
// 原价 / 报价金额 / 折扣 sit side by side (owner, 2026-09-26: 应该有原价列，
// 直观比较报价与原价). Three columns rather than one "原价 → 报价" cell: a
// column holds one dimension (owner, 2026-09-04), and each of the three is
// something a reader sorts by.
//
// The tool row, 序号 / 操作 and the pager follow the table fittings; there is
// NO selection column (owner, same day: 可以不要选择列) - nothing on this page
// acts on several quotes at once.

export interface QuoteRow {
  readonly opportunityId: string;
  readonly opportunityNo: string;
  readonly name: string;
  readonly accountId: string;
  readonly accountName: string | null;
  /** The customer's level (级别徽章); null = no level or not allowed to read it. */
  readonly accountLevel: { readonly name: string; readonly medal: "gold" | "silver" | "bronze" } | null;
  readonly stage: string;
  readonly lineCount: number;
  readonly amount: number;
  readonly currency: string;
  /** The lines at list price; null = no line has a price-book entry (or the book is not readable). */
  readonly listAmount: number | null;
  /** 1 - quoted / list over the listed lines; null with listAmount. */
  readonly discount: number | null;
  /** Lines left out of 原价 for having no price-book entry. */
  readonly unpriced: number;
  /** Lines below the floor that nobody has signed for yet. */
  readonly awaitingSignature: number;
}

export interface QuoteTableProps {
  readonly rows: readonly QuoteRow[];
  /** The workspace's own stage catalog (incr/0057). */
  readonly stageDefinitions?: readonly StageDefinition[];
}

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, a discount on the ratio. */
const SORT_ON = {
  deal: (r: QuoteRow) => r.name,
  account: (r: QuoteRow) => r.accountName,
  list: (r: QuoteRow) => r.listAmount,
  amount: (r: QuoteRow) => r.amount,
  discount: (r: QuoteRow) => r.discount,
  signature: (r: QuoteRow) => r.awaitingSignature,
};

type SignatureFilter = "" | "awaiting" | "clear";

export function QuoteTable({ rows, stageDefinitions = DEFAULT_STAGE_DEFINITIONS }: QuoteTableProps) {
  const { DATA_TABLE_LABELS, DS_LABELS, QUOTE_TEXT, STAGE_LABEL } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const [view, setView] = useState<"list" | "cards">("list");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [signatureFilter, setSignatureFilter] = useState<SignatureFilter>("");
  const sorted = useTableSort<QuoteRow>([], SORT_ON);

  const stagesPresent = useMemo(() => [...new Set(rows.map((r) => r.stage))], [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.opportunityNo.toLowerCase().includes(q) ||
          (r.accountName ?? "").toLowerCase().includes(q)) &&
        (stageFilter === "" || r.stage === stageFilter) &&
        (signatureFilter === "" || (signatureFilter === "awaiting") === r.awaitingSignature > 0),
    );
  }, [rows, query, stageFilter, signatureFilter]);
  // Sorted BEFORE paging: a sort that only reorders the page you are on is
  // not a sort of the list.
  const ordered = useMemo(() => sorted.sortRows(visible), [sorted, visible]);
  const pagination = useListPagination(ordered, 20);

  const filtering = query !== "" || stageFilter !== "" || signatureFilter !== "";
  const money = (n: number | null, r: QuoteRow) => formatMoney(n, r.currency, locale);
  const stageTag = (r: QuoteRow) => (
    <Tag tone={STAGE_TONE[r.stage as Stage]} dot>
      {stageLabelFor(r.stage, stageDefinitions, STAGE_LABEL)}
    </Tag>
  );
  const signature = (r: QuoteRow) =>
    // Zero draws nothing. A badge on every row would spend the colour that
    // the blocked ones need.
    r.awaitingSignature > 0 ? (
      <StatusBadge tone="warning">{QUOTE_TEXT.awaiting(r.awaitingSignature)}</StatusBadge>
    ) : (
      <span className="text-muted-foreground">-</span>
    );
  const actions = (r: QuoteRow) => (
    <RowActions
      label={DS_LABELS.actionMenu}
      items={[
        { id: "deal", label: QUOTE_TEXT.openDeal, icon: "arrow-right", onSelect: () => router.push(`/pipeline/${r.opportunityId}`) },
        { id: "account", label: QUOTE_TEXT.openAccount, icon: "buildings", onSelect: () => router.push(`/account/${r.accountId}`) },
      ]}
    />
  );

  const columns: readonly DataTableColumn<QuoteRow>[] = [
    {
      id: "deal",
      sortable: true,
      header: QUOTE_TEXT.colDeal,
      // Floors, not pins: auto layout sizes the rest to their content, and in
      // a narrow middle column the table scrolls rather than crushing names.
      width: "md",
      cell: (r) => (
        <TableTitleCell
          icon="medal"
          tooltip={r.name}
          title={
            <Link href={`/pipeline/${r.opportunityId}`} className="hover:underline">
              {r.name}
            </Link>
          }
          description={QUOTE_TEXT.dealMeta(r.opportunityNo, r.lineCount)}
        />
      ),
    },
    {
      id: "account",
      sortable: true,
      header: QUOTE_TEXT.colAccount,
      width: "sm",
      align: "left",
      cell: (r) => <AccountCell row={r} />,
    },
    {
      id: "list",
      header: QUOTE_TEXT.colList,
      sortable: true,
      align: "money",
      cell: (r) => <ListCell row={r} text={r.listAmount === null ? null : money(r.listAmount, r)} />,
    },
    { id: "amount", header: QUOTE_TEXT.colAmount, sortable: true, align: "money", cell: (r) => money(r.amount, r) },
    {
      id: "discount",
      header: QUOTE_TEXT.colDiscount,
      sortable: true,
      // Centred text, not align "numeric": the DS's number block floors at
      // 12ch for money, and a six-character percentage would carry 60px of air.
      cell: (r) =>
        r.discount === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className={`tabular-nums ${r.discount > 0 ? "text-foreground" : "text-muted-foreground"}`}>{QUOTE_TEXT.discount(r.discount)}</span>
        ),
    },
    { id: "signature", header: QUOTE_TEXT.colSignature, sortable: true, cell: signature },
    // 阶段 LAST: on this page it is context, not the subject. The three money
    // columns sit right after the names so 原价 vs 报价 stays on screen in a
    // narrow middle column, where everything past ~700px scrolls.
    { id: "stage", header: QUOTE_TEXT.colStage, cell: stageTag },
  ];

  if (rows.length === 0) {
    return (
      <Section id="quotes" icon="receipt">
        <EmptyState title={QUOTE_TEXT.none} description={QUOTE_TEXT.noneWhy} />
      </Section>
    );
  }

  return (
    <Section id="quotes" icon="receipt">
      <FilterBar
        view={view}
        onViewChange={setView}
        count={filtering ? QUOTE_TEXT.filteredCount(visible.length, rows.length) : QUOTE_TEXT.rowCount(rows.length)}
        search={
          <SearchSlot>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={QUOTE_TEXT.searchHint}
              aria-label={QUOTE_TEXT.searchLabel}
              onChange={(e) => {
                setQuery(e.target.value);
                pagination.resetPage();
              }}
            />
          </SearchSlot>
        }
        onReset={
          filtering
            ? () => {
                setQuery("");
                setStageFilter("");
                setSignatureFilter("");
                pagination.resetPage();
              }
            : undefined
        }
        resetLabel={QUOTE_TEXT.resetFilters}
      >
        <FilterSlot width="w-[7rem]">
          <NativeSelect
            value={stageFilter}
            aria-label={QUOTE_TEXT.colStage}
            onChange={(e) => {
              setStageFilter(e.target.value);
              pagination.resetPage();
            }}
          >
            <option value="">{QUOTE_TEXT.filterAllStages}</option>
            {stagesPresent.map((s) => (
              <option key={s} value={s}>
                {stageLabelFor(s, stageDefinitions, STAGE_LABEL)}
              </option>
            ))}
          </NativeSelect>
        </FilterSlot>
        <FilterSlot width="w-[8.5rem]">
          <NativeSelect
            value={signatureFilter}
            aria-label={QUOTE_TEXT.filterSignature}
            onChange={(e) => {
              setSignatureFilter(e.target.value as SignatureFilter);
              pagination.resetPage();
            }}
          >
            <option value="">{QUOTE_TEXT.filterAllSignature}</option>
            <option value="awaiting">{QUOTE_TEXT.filterAwaiting}</option>
            <option value="clear">{QUOTE_TEXT.filterClear}</option>
          </NativeSelect>
        </FilterSlot>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState title={QUOTE_TEXT.noMatch} description={QUOTE_TEXT.noMatchWhy} />
      ) : view === "list" ? (
        /* AUTO LAYOUT, not table-fixed: this table lives in the middle
           column (776px at a 1600px window), and fixed layout shared that out
           so evenly the deal and customer names got 68px each. 序号 / 操作 stay
           the DS's 64px either way. 行项 rides on the deal's second line
           (编号 · N 行项) - a supplementary fact, not a column of its own. */
        <div>
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={pagination.indexStart}
            rowKey={(r: QuoteRow) => r.opportunityId}
            rows={[...pagination.pageRows]}
            sort={sorted.sort}
            onSortChange={(s) => {
              sorted.onSortChange(s);
              pagination.resetPage();
            }}
            columns={columns}
            rowActions={actions}
          />
        </div>
      ) : (
        <ListCardGrid>
          {pagination.pageRows.map((r) => (
            <ListCard
              key={r.opportunityId}
              icon="medal"
              title={<Link href={`/pipeline/${r.opportunityId}`}>{r.name}</Link>}
              description={r.opportunityNo}
              /* 待签 in the meta row, not the status slot: in a 250px card the
                 status slot squeezed the title down to one character. Money
                 as three separate items so a wrap falls between them, never
                 inside "原价 X → 报价 Y". */
              actions={actions(r)}
              meta={
                <>
                  <AccountCell row={r} />
                  {stageTag(r)}
                  {r.awaitingSignature > 0 ? signature(r) : null}
                  <span className="text-foreground font-semibold tabular-nums">{money(r.amount, r)}</span>
                  {r.listAmount === null ? null : (
                    <span className="text-muted-foreground tabular-nums">{QUOTE_TEXT.listShort(money(r.listAmount, r))}</span>
                  )}
                  {r.discount === null ? null : <span className="tabular-nums">{QUOTE_TEXT.discount(r.discount)}</span>}
                </>
              }
            />
          ))}
        </ListCardGrid>
      )}
      {visible.length > 0 ? <PaginationFooter pagination={pagination} total={rows.length} filteredTotal={filtering ? visible.length : undefined} /> : null}
    </Section>
  );
}

/** 客户 with its 级别徽章 before the name; the name opens the customer. */
function AccountCell({ row }: { readonly row: QuoteRow }) {
  const { QUOTE_TEXT } = useMessages();
  if (!row.accountName) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-xs">
      {row.accountLevel ? <LevelMedal medal={row.accountLevel.medal} label={QUOTE_TEXT.levelOf(row.accountLevel.name)} /> : null}
      <Link href={`/account/${row.accountId}`} className="truncate hover:underline" title={row.accountName}>
        {row.accountName}
      </Link>
    </span>
  );
}

/** 原价, with the unpriced lines owned up to on hover rather than hidden. */
function ListCell({ row, text }: { readonly row: QuoteRow; readonly text: string | null }) {
  const { QUOTE_TEXT } = useMessages();
  if (text === null) return <span className="text-muted-foreground">{QUOTE_TEXT.noList}</span>;
  if (row.unpriced === 0) return <>{text}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="underline decoration-dotted underline-offset-4">{text}</span>
      </TooltipTrigger>
      <TooltipContent>{QUOTE_TEXT.unpricedHint(row.unpriced)}</TooltipContent>
    </Tooltip>
  );
}
