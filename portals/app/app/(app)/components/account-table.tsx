"use client";

import { MemberName, useMemberName } from "../lib/member-names";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Stack,
  StatusBadge,
  TableTitleCell,
  useListPagination,
  useToast,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import { FilterSlot, PaginationFooter, SearchSlot, useTableSort } from "./table-fittings";
import { filterAccounts, type HealthBand } from "../lib/account-list-filter";
import type { AccountRecord } from "../../domains/account/store";
import { recomputeAccountHealth } from "../account/actions";
import { healthTone } from "../lib/view-model";

import { useMessages } from "../lib/i18n/provider";
import { LevelMedal, Tag } from "./tag";
import { AccountDeleteDialog, type AccountDeleteProps } from "./account-delete-dialog";
// The account list's table.
//
// It lives in a CLIENT component because DataTableColumn.cell is a function,
// and a function cannot cross the server/client boundary - React refuses to
// serialise it. Building these columns in the page (a server component) threw
// "Functions cannot be passed directly to Client Components" at render time,
// which `next build` never caught because the page is force-dynamic and is
// therefore never prerendered.
//
// The page keeps the gates and the data fetch; only the rendering moved.
//
// IT HAD NO ACTION COLUMN, so this page carried zero buttons and a customer
// could be read but never acted on - while recomputeAccountHealth sat wired in
// account/actions.ts. The convention everywhere else in this product is a
// PINNED last column with one trigger, and it applies here for the same reason
// it applies there: a wide table scrolls its own actions out of reach, and a
// row of buttons per row is a wall of chrome.

export interface AccountTableProps {
  readonly rows: readonly AccountRecord[];
  /**
   * Accounts where nobody has reached the economic buyer.
   *
   * A SET rather than a flag per row, because the fact comes from the
   * judgement feed and not from the account record - and passing it as a set
   * keeps the roster's own type from growing a field the account service does
   * not own. Empty when the reader's tier cannot see contact chains, which is
   * why an absent id means "not established", never "reached".
   */
  readonly buyerUnreachable?: ReadonlySet<string>;
  /**
   * 状态标签, DERIVED from the facts (YC-021 L5) - never the stored
   * `account.status`, which nothing writes after creation. Null when the
   * derivation could not be read: the tag is left out rather than showing a
   * label that may be years stale.
   */
  readonly statusOf: ReadonlyMap<string, string> | null;
  /** False when the member may read accounts but not recompute them. */
  readonly canRecompute?: boolean;
  /** 删除客户 in the row menu. Absent = no delete control at all; present but
   *  `canDelete` false = shown disabled with the reason (a menu that changes
   *  with the viewer teaches nobody what the product can do). */
  readonly canDelete?: boolean;
  readonly remove?: AccountDeleteProps;
  /**
   * segment_code -> display name, resolved on the page. account.segment_code
   * is a plain string with no foreign key behind it, so a code CAN point at a
   * definition that does not exist - and when it does, the raw code is shown
   * rather than a blank, because a dangling anchor is a finding to surface,
   * not a cell to tidy.
   */
  readonly segmentNames?: ReadonlyMap<string, string>;
  /** 客户级别 per account (name + medal), resolved on the page from the
   *  importance scheme - the same source as the customer page's 级别 coin.
   *  Absent = no badge and no 级别 filter, never a guessed level. */
  readonly levelOf?: ReadonlyMap<string, { readonly name: string; readonly medal: "gold" | "silver" | "bronze" }>;
}

/* 排序取值: what each sortable column ORDERS ON, which is not always what
   it renders - a badge sorts on the score inside it, a money cell on the raw
   amount rather than its formatted string. */
const SORT_ON = {
    name: (r: AccountRecord) => r.name,
  };

export function AccountTable({
  rows,
  canRecompute = true,
  segmentNames,
  buyerUnreachable,
  statusOf,
  levelOf,
  canDelete = false,
  remove,
}: AccountTableProps) {
  const { ACCOUNT_DELETE_TEXT, ACCOUNT_STATUS_LABEL, ACCOUNT_TEXT, DATA_TABLE_LABELS, DS_LABELS, TABLE_TOOLBAR_TEXT } =
    useMessages();
  const [deleting, setDeleting] = useState<AccountRecord | null>(null);
  const props = { remove, canDelete };
  const statusLabel = (id: string) => {
    const s = statusOf?.get(id);
    return s ? (ACCOUNT_STATUS_LABEL[s] ?? s) : null;
  };
  const statusTag = (id: string) => {
    const label = statusLabel(id);
    return label ? (
      <Tag tone={statusOf?.get(id) === "churned" ? "danger" : "neutral"} dot>
        {label}
      </Tag>
    ) : null;
  };
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<FilterBarView>("list");
  const sorted = useTableSort(rows, SORT_ON);
  // 工具行 (module rebuild, 2026-09-27): 98 customers used to sit on one page
  // with no way to look one up.
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [health, setHealth] = useState<HealthBand | "">("");
  const filtering = query !== "" || level !== "" || health !== "";
  const visible = useMemo(() => filterAccounts(rows, { query, level, health }, levelOf), [rows, query, level, health, levelOf]);
  const ordered = useMemo(() => sorted.sortRows(visible), [sorted, visible]);
  const pagination = useListPagination(ordered, 20);
  // By rank - the medal is the rank (gold = 1) - so 战略级 leads the filter.
  const MEDAL_ORDER = { gold: 0, silver: 1, bronze: 2 } as const;
  const levelsPresent = useMemo(
    () =>
      [...new Map([...(levelOf?.values() ?? [])].map((l) => [l.name, MEDAL_ORDER[l.medal]] as const))]
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name),
    [levelOf],
  );
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        title={ACCOUNT_TEXT.emptyTitle}
        description={ACCOUNT_TEXT.emptyDescription}
      />
    );
  }

  function recompute(id: string, name: string) {
    setBusyId(id);
    start(async () => {
      const r = await recomputeAccountHealth(id);
      setBusyId(null);
      // The new number is announced rather than left for the reader to spot in
      // a re-rendered table: the whole point of asking was to learn what it
      // became, and a row that quietly changes colour does not answer that.
      toast(
        r.ok
          ? {
              tone: "success",
              title: ACCOUNT_TEXT.recomputedTitle,
              description: ACCOUNT_TEXT.recomputedOn(name, r.score ?? null),
            }
          : {
              tone: "danger",
              title: ACCOUNT_TEXT.recomputeFailed,
              description: r.error ?? "",
            },
      );
    });
  }

  function actions(row: AccountRecord) {
    return (
      <ActionMenu
        label={DS_LABELS.actionMenu}
        disabled={pending && busyId === row.id}
        items={[
          {
            id: "open",
            label: ACCOUNT_TEXT.openAccount,
            icon: "arrow-right",
            onSelect: () => router.push(`/account/${row.id}`),
          },
          {
            id: "recompute",
            label: ACCOUNT_TEXT.recompute,
            icon: "refresh",
            // Present and disabled rather than absent: a menu whose contents
            // change with the viewer teaches nobody what the product can do.
            disabled: !canRecompute,
            hint: canRecompute
              ? ACCOUNT_TEXT.recomputeHint
              : ACCOUNT_TEXT.recomputeDenied,
            onSelect: () => recompute(row.id, row.name),
          },
          ...(props.remove
            ? [
                {
                  id: "delete",
                  label: ACCOUNT_DELETE_TEXT.menu,
                  icon: "trash" as const,
                  danger: true as const,
                  // The item only OPENS the confirmation (which checks what is on
                  // the customer first), so the menu has nothing more to ask.
                  confirmExempt: "opens its own confirmation dialog, which reads the customer's records first",
                  separatorBefore: true,
                  disabled: !props.canDelete,
                  hint: props.canDelete ? undefined : ACCOUNT_TEXT.recomputeDenied,
                  onSelect: () => setDeleting(row),
                },
              ]
            : []),
        ]}
      />
    );
  }

  const columns: readonly DataTableColumn<AccountRecord>[] = [
    {
      // EVERY COLUMN IS "auto" HERE, deliberately, and that is a departure
      // from the DS's default advice worth stating. Its width grades are
      // MINIMUMS meant to make six different tables agree with each other; on
      // this five-column table the smallest grade measured ~157px, so grading
      // industry and owner pushed them PAST the customer name and left the
      // title the narrowest column on the table at 136px, behind two columns
      // holding "零售" and a subject id. Auto distribution reads better here
      // because the name is the only column whose content actually varies.
      id: "name",
  sortable: true,
      header: ACCOUNT_TEXT.columnName,
      // A link rather than an onRowClick handler: navigable, middle-clickable
      // and shareable in a way a click handler is not.
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-sm">
          {levelOf?.get(row.id) ? (
            <LevelMedal medal={levelOf.get(row.id)!.medal} label={ACCOUNT_TEXT.levelOf(levelOf.get(row.id)!.name)} />
          ) : null}
        <TableTitleCell
          className="min-w-0"
          title={
            <Link href={`/account/${row.id}`} className="hover:underline">
              {row.name}
            </Link>
          }
          tooltip={row.name}
          titleSuffix={
            buyerUnreachable?.has(row.id) ? (
              <StatusBadge tone="warning">{ACCOUNT_TEXT.buyerUnreachable}</StatusBadge>
            ) : undefined
          }
          description={row.accountNo}
        />
        </span>
      ),
    },
    {
      // INDUSTRY OVER SEGMENT: both answer "what kind of customer is this",
      // one from the outside world and one from our own cut of it, and they
      // are read together or not at all.
      //
      // The D1 cut is read-only here on purpose: D4 references the segment,
      // D1 owns it, and the place to change a definition is /strategy.
      id: "industry",
      header: ACCOUNT_TEXT.columnIndustrySegment,
      cell: (row) => (
        <Stack gap="sm">
          <span>{row.industry ?? "-"}</span>
          <span className="text-muted-foreground">
            {row.segmentCode
              ? (segmentNames?.get(row.segmentCode) ?? row.segmentCode)
              : "-"}
          </span>
        </Stack>
      ),
    },
    {
      id: "owner",
      header: ACCOUNT_TEXT.columnOwner,
      // The raw subject, marked as one. There is no display name on the record
      // to resolve it against, and this file's own sibling says why that
      // matters - "an overdue promise that shows a UUID is one nobody chases".
      // Until the directory lands, the honest rendering is a monospaced id that
      // LOOKS like an id, rather than a machine string dressed as a person and
      // given the second-widest column on the table.
      cell: (row) =>
        row.ownerSub ? (
          <span className="text-body-small">
            <MemberName sub={row.ownerSub} />
          </span>
        ) : (
          <span className="text-muted-foreground text-body-small">
            {ACCOUNT_TEXT.ownerNone}
          </span>
        ),
    },
    {
      // HEALTH OVER STATUS: both are the customer's CONDITION - one derived and
      // one declared - and a score means something different above "churned"
      // than above "active". Side by side they were two columns asking the
      // reader to pair them; stacked, they are already paired.
      id: "health",
      header: ACCOUNT_TEXT.columnHealthStatus,
      cell: (row) => (
        <Stack gap="sm" className="items-center">
          {row.healthScore == null ? (
            <Tag>{ACCOUNT_TEXT.unscored}</Tag>
          ) : (
            <Tag tone={healthTone(row.healthScore)}>
              {row.healthScore}
            </Tag>
          )}
          {statusTag(row.id)}
        </Stack>
      ),
    },
  ];

  return (
    <>
      {/* The tool row: what this list looks like, and how many are in it.
          FilterBar owns the arrangement, so the page does not invent a second
          toolbar grammar. */}
      <FilterBar
        view={view}
        onViewChange={setView}
        count={filtering ? TABLE_TOOLBAR_TEXT.filteredCount(visible.length, rows.length) : ACCOUNT_TEXT.rowCount(rows.length)}
        search={
          <SearchSlot>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={ACCOUNT_TEXT.searchHint}
              aria-label={TABLE_TOOLBAR_TEXT.searchLabel}
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
                setLevel("");
                setHealth("");
                pagination.resetPage();
              }
            : undefined
        }
        resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
      >
        {levelsPresent.length > 0 ? (
          <FilterSlot width="w-[7rem]">
            <NativeSelect value={level} aria-label={ACCOUNT_TEXT.filterLevel} onChange={(e) => { setLevel(e.target.value); pagination.resetPage(); }}>
              <option value="">{ACCOUNT_TEXT.filterAllLevels}</option>
              {levelsPresent.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </NativeSelect>
          </FilterSlot>
        ) : null}
        <FilterSlot width="w-[7rem]">
          <NativeSelect value={health} aria-label={ACCOUNT_TEXT.filterHealth} onChange={(e) => { setHealth(e.target.value as HealthBand | ""); pagination.resetPage(); }}>
            <option value="">{ACCOUNT_TEXT.filterAllHealth}</option>
            {(["good", "warn", "bad", "unscored"] as const).map((b) => (
              <option key={b} value={b}>{ACCOUNT_TEXT.healthBand[b]}</option>
            ))}
          </NativeSelect>
        </FilterSlot>
      </FilterBar>

      {/* ONLY THE TABLE IS IN A CARD, not the section: the section is a heading
          and its tools, the card is the surface the rows sit on. */}
        {visible.length === 0 ? (
          <EmptyState title={TABLE_TOOLBAR_TEXT.noMatch} description={TABLE_TOOLBAR_TEXT.noMatchWhy} />
        ) : view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={pagination.indexStart}
            columns={columns}
            rows={[...pagination.pageRows]}
            sort={sorted.sort}
            onSortChange={(s) => {
              sorted.onSortChange(s);
              pagination.resetPage();
            }}
            rowKey={(row) => row.id}
            rowActions={actions}
          />
        ) : (
          <ListCardGrid className="p-md">
            {pagination.pageRows.map((row) => (
              <ListCard
                key={row.id}
                title={
                  <Link href={`/account/${row.id}`} className="hover:underline">
                    {row.name}
                  </Link>
                }
                description={row.accountNo}
                status={
                  row.healthScore == null ? (
                    <Tag>
                      {ACCOUNT_TEXT.unscored}
                    </Tag>
                  ) : (
                    <Tag tone={healthTone(row.healthScore)}>
                      {row.healthScore}
                    </Tag>
                  )
                }
                actions={actions(row)}
                meta={
                  <>
                    <span>{row.industry ?? "-"}</span>
                    {statusLabel(row.id) ? <span>{statusLabel(row.id)}</span> : null}
                  </>
                }
              />
            ))}
          </ListCardGrid>
        )}
      {visible.length > 0 ? (
        <PaginationFooter pagination={pagination} total={rows.length} filteredTotal={filtering ? visible.length : undefined} />
      ) : null}
      {remove && deleting ? (
        <AccountDeleteDialog
          accountId={deleting.id}
          name={deleting.name}
          open
          onOpenChange={(o) => {
            if (!o) setDeleting(null);
          }}
          onFootprint={remove.onFootprint}
          onDelete={remove.onDelete}
        />
      ) : null}
    </>
  );
}
