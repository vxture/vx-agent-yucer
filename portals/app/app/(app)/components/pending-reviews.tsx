"use client";

import { useState, useTransition } from "react";
import { Button, DataTable, EmptyState, Input, Label, Card, FilterBar, ListCard, ListCardGrid, NativeSelect, Section, SegmentedControl, StatusBadge, Textarea, type DataTableColumn } from "@vxture/design-ui";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import { PIPELINE_TEXT, WINLOSS_REASON_LABEL, WINLOSS_TEXT } from "../lib/messages";
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
    input: { primaryReason: string | null; competitor?: string; lessons?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const REASONS = ["price", "fit", "timing", "competitor", "no_decision", "other"] as const;

export function PendingReviews({ opportunities, allClosed, canRecord, onRecord }: PendingReviewsProps) {
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
      void onRecord(id, { primaryReason: reason, competitor, lessons }).then((r) => {
        if (!r.ok) {
          setError(r.error ?? "denied");
          return;
        }
        setOpenId(null);
        setCompetitor("");
        setLessons("");
      });
    });
  }

  const columns: readonly DataTableColumn<OpportunityRecord>[] = [
    {
      id: "name",
      header: WINLOSS_TEXT.columnOpportunity,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.opportunityNo}</div>
        </div>
      ),
    },
    {
      id: "outcome",
      header: WINLOSS_TEXT.columnOutcome,
      cell: (row) => (
        <StatusBadge tone={row.status === "won" ? "success" : "danger"} dot>
          {row.status === "won" ? WINLOSS_TEXT.outcomeWon : WINLOSS_TEXT.outcomeLost}
        </StatusBadge>
      ),
    },
    {
      id: "amount",
      header: WINLOSS_TEXT.columnAmount,
      align: "right",
      cell: (row) => formatMoney(row.amount?.amount ?? null, row.currency),
    },
    {
      id: "closed",
      header: WINLOSS_TEXT.columnClosed,
      cell: (row) => (row.closedAt ? row.closedAt.toISOString().slice(0, 10) : "-"),
    },
    {
      id: "state",
      header: "",
      align: "right",
      /* In the "all" view the two populations sit in one table, so each row has
         to say which it is - otherwise a reviewed deal looks like outstanding
         work. Reviewed rows carry a badge instead of the button, which is also
         the truthful control: there is nothing left to record on them. */
      cell: (row) =>
        !pendingIds.has(row.id) ? (
          <StatusBadge tone="success">{WINLOSS_TEXT.reviewed}</StatusBadge>
        ) : canRecord ? (
          <Button
            variant={openId === row.id ? "secondary" : "outline"}
            size="sm"
            onClick={() => setOpenId(openId === row.id ? null : row.id)}
          >
            {WINLOSS_TEXT.record}
          </Button>
        ) : null,
    },
  ];

  const target = opportunities.find((o) => o.id === openId) ?? null;

  return (
    <Section
      icon="lightbulb"
      title={WINLOSS_TEXT.sectionTitle}
      description={WINLOSS_TEXT.description}
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
              { value: "pending", label: WINLOSS_TEXT.filterPending, count: opportunities.length },
              { value: "all", label: WINLOSS_TEXT.filterAll, count: allClosed.length },
            ]}
          />
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          title={scope === "pending" ? WINLOSS_TEXT.emptyTitle : WINLOSS_TEXT.allEmptyTitle}
          description={scope === "pending" ? WINLOSS_TEXT.emptyDescription : WINLOSS_TEXT.allEmptyDescription}
        />
      ) : (
        /* Only the table is in the card - the heading and its tools stay
           outside it, the same as the board. */
        <Card className="p-xs">
          {view === "list" ? (
            <DataTable leadingSpacer indexStart={1} columns={columns} rows={shown} rowKey={(row) => row.id} />
          ) : (
            <ListCardGrid className="p-md">
              {shown.map((row) => (
                <ListCard
                  key={row.id}
                  title={row.name}
                  description={row.opportunityNo}
                  status={
                    <StatusBadge tone={row.status === "won" ? "success" : "danger"}>
                      {row.status === "won" ? WINLOSS_TEXT.outcomeWon : WINLOSS_TEXT.outcomeLost}
                    </StatusBadge>
                  }
                  meta={
                    !pendingIds.has(row.id) ? (
                      <StatusBadge tone="success">{WINLOSS_TEXT.reviewed}</StatusBadge>
                    ) : (
                      <span>{row.closedAt ? row.closedAt.toISOString().slice(0, 10) : "-"}</span>
                    )
                  }
                />
              ))}
            </ListCardGrid>
          )}
        </Card>
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
          <Textarea id="wlr-lessons" value={lessons} onChange={(e) => setLessons(e.currentTarget.value)} />

          <Button variant="ghost" onClick={() => setOpenId(null)} disabled={pending}>
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
