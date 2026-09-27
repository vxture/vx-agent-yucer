"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  Field,
  FieldLabel,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Section,
  SegmentedControl,
  StatusBadge,
  TableTitleCell,
  Textarea,
  useListPagination,
  type DataTableColumn,
} from "@vxture/design-ui";
import { FilterSlot, PaginationFooter, SearchSlot, useTableSort } from "./table-fittings";
import { DialogForm } from "./dialog-form";
import { Tag } from "./tag";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";

// Closed deals still owing a post-mortem.
//
// The spec says entering a terminal stage MUST produce a review. Closing does
// not block on it - blocking would push people to leave deals open instead, and
// an open deal that is really lost distorts every forecast number. So the debt
// is made VISIBLE here instead, which is what turns "must" from a sentence in a
// document into something a person can act on.
//
// The form does not ask for the outcome. It is derived from the deal's own
// status server-side: a review claiming "won" on a lost deal would corrupt the
// dataset the whole learning loop reads.

export interface PendingReviewsProps {
  /** Closed and NOT yet reviewed - the debt the close rule creates. */
  readonly opportunities: readonly OpportunityRecord[];
  /**
   * Every closed opportunity, reviewed or not.
   *
   * Passed in rather than fetched: the page already lists the pipeline with
   * closed rows included, so a second query would ask the database for rows it
   * had just handed us - and could answer differently if anything changed in
   * between, which would put two figures on one screen that disagree.
   */
  readonly allClosed: readonly OpportunityRecord[];
  readonly canRecord: boolean;
  /**
   * 赢丢原因, THE WORKSPACE'S OWN (incr/0039). It was six literals in this
   * file; the list is rows now, and each row says which outcome it explains -
   * so a loss-only reason is not offered on a win.
   */
  readonly reasons: readonly {
    readonly id: string;
    readonly name: string;
    readonly forWon: boolean;
    readonly forLost: boolean;
  }[];
  readonly onRecord: (
    opportunityId: string,
    input: {
      primaryReasonId: string | null;
      competitor?: string;
      lessons?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

/* 排序取值: what each sortable column ORDERS ON, which is not always what
   it renders - a badge sorts on the score inside it, a money cell on the raw
   amount rather than its formatted string. */
const SORT_ON = {
    name: (r: OpportunityRecord) => r.name,
    amount: (r: OpportunityRecord) => r.amount?.amount ?? null,
  };

export function PendingReviews({
  opportunities,
  allClosed,
  canRecord,
  reasons,
  onRecord,
}: PendingReviewsProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    PIPELINE_TEXT,
    TABLE_TOOLBAR_TEXT,
    WINLOSS_TEXT,
    REVIEW_ERROR,
  } = useMessages();
  // Three outcomes since YC-065 R6: an abandoned deal is neither won nor lost
  // to a buyer, and labelling it "lost" would put our own decision into the
  // loss analysis.
  // An abandoned outcome is a Tag: a neutral StatusBadge draws a dash icon.
  const outcomeBadge = (status: string, dot: boolean) =>
    status === "abandoned" ? (
      <Tag>{WINLOSS_TEXT.outcomeAbandoned}</Tag>
    ) : (
      <StatusBadge tone={status === "won" ? "success" : "danger"} dot={dot}>
        {status === "won" ? WINLOSS_TEXT.outcomeWon : WINLOSS_TEXT.outcomeLost}
      </StatusBadge>
    );
  const sorted = useTableSort<OpportunityRecord>([], SORT_ON);
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [view, setView] = useState<"list" | "cards">("list");
  // Pending is a SUBSET of all, so the two lists share every row object - the
  // outstanding badge below reads the pending ids rather than a second flag.
  const pendingIds = new Set(opportunities.map((o) => o.id));
  const population = scope === "pending" ? opportunities : allClosed;
  // 工具行 (module rebuild, 2026-09-27): search + 结果 filter + pager.
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("");
  const filtering = query !== "" || outcome !== "";
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return population.filter(
      (o) =>
        (q === "" || o.name.toLowerCase().includes(q) || o.opportunityNo.toLowerCase().includes(q)) &&
        (outcome === "" || o.status === outcome),
    );
  }, [population, query, outcome]);
  const ordered = useMemo(() => sorted.sortRows(shown), [sorted, shown]);
  const pagination = useListPagination(ordered, 20);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [competitor, setCompetitor] = useState("");
  const [lessons, setLessons] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(id: string) {
    setError(null);
    startTransition(() => {
      void onRecord(id, { primaryReasonId: reason || null, competitor, lessons }).then(
        (r) => {
          if (!r.ok) {
            setError(REVIEW_ERROR[r.error ?? "denied"] ?? REVIEW_ERROR.denied);
            return;
          }
          setOpenId(null);
          setCompetitor("");
          setLessons("");
        },
      );
    });
  }

  const recordMenu = (row: OpportunityRecord) => (
    <ActionMenu
      label={DS_LABELS.actionMenu}
      items={[
        {
          id: "record",
          label: WINLOSS_TEXT.record,
          disabled: !canRecord || !pendingIds.has(row.id),
          hint: !canRecord
            ? WINLOSS_TEXT.recordHintDenied
            : !pendingIds.has(row.id)
              ? WINLOSS_TEXT.recordHintDone
              : undefined,
          onSelect: () => setOpenId(row.id),
        },
      ]}
    />
  );

  const columns: readonly DataTableColumn<OpportunityRecord>[] = [
    {
      id: "name",
  sortable: true,
      header: WINLOSS_TEXT.columnOpportunity,
      cell: (row) => (
        <TableTitleCell title={row.name} description={row.opportunityNo} tooltip={row.name} />
      ),
    },
    {
      id: "outcome",
      header: WINLOSS_TEXT.columnOutcome,
      cell: (row) => (
        outcomeBadge(row.status, true)
      ),
    },
    {
      id: "amount",
      header: WINLOSS_TEXT.columnAmount,
      sortable: true,
      align: "money",
      cell: (row) => formatMoney(row.amount?.amount ?? null, row.currency),
    },
    {
      id: "closed",
      header: WINLOSS_TEXT.columnClosed,
      cell: (row) =>
        row.closedAt ? row.closedAt.toISOString().slice(0, 10) : "-",
    },
    {
      id: "state",
      header: WINLOSS_TEXT.columnState,
      /* State only. In the "all" view the two populations sit in one table, so
         each row has to say which it is - otherwise a reviewed deal looks like
         outstanding work. The VERB that used to share this cell moved to the
         fixed action column, where a row action belongs. */
      cell: (row) =>
        !pendingIds.has(row.id) ? (
          <StatusBadge tone="success">{WINLOSS_TEXT.reviewed}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">{WINLOSS_TEXT.filterPending}</StatusBadge>
        ),
    },
  ];

  const target = opportunities.find((o) => o.id === openId) ?? null;

  return (
    <Section
      /* The launcher lists this as a SECTION of /pipeline and links to
         /pipeline#winloss. Without the id that link lands on the page and
         scrolls nowhere: the 6d fix relabelled the module honestly and left
         the destination it now promised unbuilt. */
      id="winloss"
      icon="lightbulb"
    >
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {/* Tool row, same grammar as the board's: the DS keeps `scope` apart from
          the filter group on the record - a filter shows fewer rows of one
          population, a scope swaps the population. 待复盘 / 全部复盘 swaps it,
          so it belongs in `scope`. */}
      <FilterBar
        view={view}
        onViewChange={setView}
        count={filtering ? TABLE_TOOLBAR_TEXT.filteredCount(shown.length, population.length) : PIPELINE_TEXT.rowCount(population.length)}
        search={
          <SearchSlot>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={WINLOSS_TEXT.searchHint}
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
                setOutcome("");
                pagination.resetPage();
              }
            : undefined
        }
        resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
        scope={
          <SegmentedControl
            size="sm"
            ariaLabel={WINLOSS_TEXT.sectionTitle}
            value={scope}
            onChange={(v) => {
              setScope(v);
              pagination.resetPage();
            }}
            items={[
              {
                value: "pending",
                label: WINLOSS_TEXT.filterPending,
                count: opportunities.length,
              },
              {
                value: "all",
                label: WINLOSS_TEXT.filterAll,
                count: allClosed.length,
              },
            ]}
          />
        }
      >
        <FilterSlot width="w-[7rem]">
          <NativeSelect
            value={outcome}
            aria-label={WINLOSS_TEXT.filterOutcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              pagination.resetPage();
            }}
          >
            <option value="">{WINLOSS_TEXT.filterAllOutcomes}</option>
            <option value="won">{WINLOSS_TEXT.outcomeWon}</option>
            <option value="lost">{WINLOSS_TEXT.outcomeLost}</option>
            <option value="abandoned">{WINLOSS_TEXT.outcomeAbandoned}</option>
          </NativeSelect>
        </FilterSlot>
      </FilterBar>

      {population.length === 0 ? (
        <EmptyState
          title={
            scope === "pending"
              ? WINLOSS_TEXT.emptyTitle
              : WINLOSS_TEXT.allEmptyTitle
          }
          description={
            scope === "pending"
              ? WINLOSS_TEXT.emptyDescription
              : WINLOSS_TEXT.allEmptyDescription
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState title={TABLE_TOOLBAR_TEXT.noMatch} description={TABLE_TOOLBAR_TEXT.noMatchWhy} />
      ) : view === "list" ? (
        /* NO CARD (design-ui 8.0.0 透明模式): a table floats on the page
           canvas, its structure carried by the three rules the DS draws. */
            <DataTable
              /* Every DS copy outlet must be passed - the fallbacks are English
               and exist so a missed prop renders something legible, not so
               anyone can rely on them. This table shipped with an "Actions"
               column header in a Chinese interface. */
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
              /* Pinned right, one trigger. Items stay VISIBLE and disabled
                 rather than absent when they cannot be used, with the reason on
                 the hint - a menu whose contents change per row teaches nobody
                 what the product can do, and "why is it greyed" is answerable
                 where "why is it missing" is not. */
              rowActions={recordMenu}
            />
          ) : (
            <ListCardGrid className="p-md">
              {pagination.pageRows.map((row) => (
                <ListCard
                  key={row.id}
                  title={row.name}
                  description={row.opportunityNo}
                  /* The record action in cards too - the card view had none -
                     and the outcome in the meta row, not the status slot
                     (it clipped the title in a 250px card). */
                  actions={recordMenu(row)}
                  meta={
                    <>
                      {outcomeBadge(row.status, false)}
                      {!pendingIds.has(row.id) ? (
                        <StatusBadge tone="success">{WINLOSS_TEXT.reviewed}</StatusBadge>
                      ) : (
                        <span>{row.closedAt ? row.closedAt.toISOString().slice(0, 10) : "-"}</span>
                      )}
                    </>
                  }
                />
              ))}
            </ListCardGrid>
      )}
      {shown.length > 0 ? (
        <PaginationFooter pagination={pagination} total={population.length} filteredTotal={filtering ? shown.length : undefined} />
      ) : null}

      {/* THE REVIEW IN A DIALOG (module rebuild, 2026-09-27). It opened as a
          section BELOW the table - with fifty rows, off-screen, so 记录复盘
          looked like it did nothing. */}
      {target ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setOpenId(null);
          }}
          title={WINLOSS_TEXT.recordTitle(target.name)}
          submitLabel={WINLOSS_TEXT.save}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) submit(target.id);
          }}
        >
          <Field>
            <FieldLabel htmlFor="wlr-reason">{WINLOSS_TEXT.reasonLabel}</FieldLabel>
            <NativeSelect id="wlr-reason" value={reason} onChange={(e) => setReason(e.currentTarget.value)}>
              {/* The ones that can explain THIS outcome. Offering a loss-only
                  reason on a win invites a review that says nothing, and the
                  service refuses it anyway. */}
              <option value="">{WINLOSS_TEXT.reasonNone}</option>
              {reasons
                .filter((r) => (target.status === "won" ? r.forWon : r.forLost))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="wlr-competitor">{WINLOSS_TEXT.competitorLabel}</FieldLabel>
            <Input id="wlr-competitor" value={competitor} onChange={(e) => setCompetitor(e.currentTarget.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="wlr-lessons">{WINLOSS_TEXT.lessonsLabel}</FieldLabel>
            <Textarea id="wlr-lessons" value={lessons} onChange={(e) => setLessons(e.currentTarget.value)} />
          </Field>
          {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
        </DialogForm>
      ) : null}
    </Section>
  );
}
