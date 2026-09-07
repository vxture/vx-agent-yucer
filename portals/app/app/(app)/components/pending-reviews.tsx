"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  Label,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Section,
  SegmentedControl,
  StatusBadge,
  TableTitleCell,
  Textarea,
  type DataTableColumn,
} from "@vxture/design-ui";
import { useTableSort } from "./table-fittings";
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
  readonly onRecord: (
    opportunityId: string,
    input: {
      primaryReason: string | null;
      competitor?: string;
      lessons?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const REASONS = [
  "price",
  "fit",
  "timing",
  "competitor",
  "no_decision",
  "other",
] as const;

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
  onRecord,
}: PendingReviewsProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    PIPELINE_TEXT,
    WINLOSS_REASON_LABEL,
    WINLOSS_TEXT,
    REVIEW_ERROR,
  } = useMessages();
  const sorted = useTableSort<OpportunityRecord>([], SORT_ON);
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [view, setView] = useState<"list" | "cards">("list");
  // Pending is a SUBSET of all, so the two lists share every row object - the
  // outstanding badge below reads the pending ids rather than a second flag.
  const pendingIds = new Set(opportunities.map((o) => o.id));
  const shown = scope === "pending" ? opportunities : allClosed;
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("fit");
  const [competitor, setCompetitor] = useState("");
  const [lessons, setLessons] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(id: string) {
    setError(null);
    startTransition(() => {
      void onRecord(id, { primaryReason: reason, competitor, lessons }).then(
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
        <StatusBadge tone={row.status === "won" ? "success" : "danger"} dot>
          {row.status === "won"
            ? WINLOSS_TEXT.outcomeWon
            : WINLOSS_TEXT.outcomeLost}
        </StatusBadge>
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
        count={PIPELINE_TEXT.rowCount(shown.length)}
        scope={
          <SegmentedControl
            size="sm"
            ariaLabel={WINLOSS_TEXT.sectionTitle}
            value={scope}
            onChange={setScope}
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
      />

      {shown.length === 0 ? (
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
      ) : view === "list" ? (
        /* NO CARD (design-ui 8.0.0 透明模式): a table floats on the page
           canvas, its structure carried by the three rules the DS draws. */
            <DataTable
              /* Every DS copy outlet must be passed - the fallbacks are English
               and exist so a missed prop renders something legible, not so
               anyone can rely on them. This table shipped with an "Actions"
               column header in a Chinese interface. */
              labels={DATA_TABLE_LABELS}
              indexStart={1}
              columns={columns}
              rows={[...sorted.sortRows(shown)]}
            sort={sorted.sort}
            onSortChange={sorted.onSortChange}
              rowKey={(row) => row.id}
              /* Pinned right, one trigger. Items stay VISIBLE and disabled
                 rather than absent when they cannot be used, with the reason on
                 the hint - a menu whose contents change per row teaches nobody
                 what the product can do, and "why is it greyed" is answerable
                 where "why is it missing" is not. */
              rowActions={(row) => (
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
                      onSelect: () =>
                        setOpenId(openId === row.id ? null : row.id),
                    },
                  ]}
                />
              )}
            />
          ) : (
            <ListCardGrid className="p-md">
              {shown.map((row) => (
                <ListCard
                  key={row.id}
                  title={row.name}
                  description={row.opportunityNo}
                  status={
                    <StatusBadge
                      tone={row.status === "won" ? "success" : "danger"}
                    >
                      {row.status === "won"
                        ? WINLOSS_TEXT.outcomeWon
                        : WINLOSS_TEXT.outcomeLost}
                    </StatusBadge>
                  }
                  meta={
                    !pendingIds.has(row.id) ? (
                      <StatusBadge tone="success">
                        {WINLOSS_TEXT.reviewed}
                      </StatusBadge>
                    ) : (
                      <span>
                        {row.closedAt
                          ? row.closedAt.toISOString().slice(0, 10)
                          : "-"}
                      </span>
                    )
                  }
                />
              ))}
            </ListCardGrid>
      )}

      {target ? (
        <Section tone="default" title={target.name}>
          <Label htmlFor="wlr-reason">{WINLOSS_TEXT.reasonLabel}</Label>
          <NativeSelect
            id="wlr-reason"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {WINLOSS_REASON_LABEL[r]}
              </option>
            ))}
          </NativeSelect>

          <Label htmlFor="wlr-competitor">{WINLOSS_TEXT.competitorLabel}</Label>
          <Input
            id="wlr-competitor"
            value={competitor}
            onChange={(e) => setCompetitor(e.currentTarget.value)}
          />

          <Label htmlFor="wlr-lessons">{WINLOSS_TEXT.lessonsLabel}</Label>
          <Textarea
            id="wlr-lessons"
            value={lessons}
            onChange={(e) => setLessons(e.currentTarget.value)}
          />

          <Button
            variant="ghost"
            onClick={() => setOpenId(null)}
            disabled={pending}
          >
            {WINLOSS_TEXT.cancel}
          </Button>
          <Button onClick={() => submit(target.id)} disabled={pending}>
            {WINLOSS_TEXT.save}
          </Button>
        </Section>
      ) : null}
    </Section>
  );
}
