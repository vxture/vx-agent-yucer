"use client";

import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// How the market is cut - DISPLAY ONLY since 2026-09-05.
//
// The create/edit form left for /segment/new (owner ruling: content-rich
// operations get a page, with the assistant beside the work). What remains is
// the table whose two counts diverge when a code was handed out against the
// definition - the finding this page exists to show.
//
// `strategy.segment.view` / `.upsert` shipped in batch 1 with nothing behind
// them (TD-016), and like the campaign executions this was not merely an
// unfinished middle - it left an anchor dangling. Seven demo accounts carry a
// `segment_code` of MIDMARKET or ENTERPRISE, and `campaign.segment_id` is a
// real foreign key, but no segment could be created, so every one of those
// references pointed at a table with no rows.
//
// THE CODE IS THE IDENTITY, and that is why it locks once a segment exists.
// `campaign.segment_id` is enforced by a foreign key; `account.segment_code` is
// a plain string with nothing behind it. A rename would break the second
// silently - the database would not complain and no page would show a gap. The
// column locks say the same thing from the other side: segment_code carries no
// UPDATE grant.

export interface SegmentRow {
  readonly id: string;
  readonly segmentCode: string;
  readonly name: string;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly priority: number;
  readonly status: string;
  /** Accounts carrying this code. The number the anchor was missing. */
  readonly accountCount: number;
  /** The definition: which industries/regions this cut names. */
  readonly criteria: {
    industries: readonly string[];
    regions: readonly string[];
  };
  /**
   * Accounts the CRITERIA match, resolved on the page. Beside accountCount it
   * says two different things: assigned-but-not-matching (the code was handed
   * out against the definition) and matching-but-unassigned (the definition
   * found accounts nobody has cut in yet). Equal numbers are the healthy case,
   * and only showing both makes the unhealthy ones visible.
   */
  readonly matchedCount: number;
}

function segmentColumns(text: {
  segmentCodeHeader: string;
  segmentNameHeader: string;
  segmentPlanHeader: string;
  segmentPriorityHeader: string;
  segmentAccountsHeader: string;
  segmentMatchedHeader: string;
  segmentCriteriaHeader: string;
  segmentStatusHeader: string;
  segmentStatusLabel: Record<string, string>;
}) {
  return [
    {
      id: "code",
      header: text.segmentCodeHeader,
      cell: (r: SegmentRow) => r.segmentCode,
    },
    {
      id: "name",
      header: text.segmentNameHeader,
      cell: (r: SegmentRow) => r.name,
    },
    {
      id: "plan",
      header: text.segmentPlanHeader,
      cell: (r: SegmentRow) => r.planName ?? "",
    },
    {
      id: "priority",
      header: text.segmentPriorityHeader,
      align: "right" as const,
      cell: (r: SegmentRow) => String(r.priority),
    },
    {
      id: "criteria",
      header: text.segmentCriteriaHeader,
      cell: (r: SegmentRow) => {
        const parts = [...r.criteria.industries, ...r.criteria.regions];
        return parts.length ? parts.join(" / ") : "";
      },
    },
    {
      id: "accounts",
      header: text.segmentAccountsHeader,
      align: "right" as const,
      // Zero is worth showing rather than blanking: a segment nothing points at
      // is a cut of the market nobody is working, which is a finding, not a gap
      // in the table.
      cell: (r: SegmentRow) => String(r.accountCount),
    },
    {
      id: "matched",
      header: text.segmentMatchedHeader,
      align: "right" as const,
      // Diverging from the assigned count is the point of showing it - see
      // SegmentRow.matchedCount.
      cell: (r: SegmentRow) =>
        r.criteria.industries.length + r.criteria.regions.length === 0
          ? ""
          : String(r.matchedCount),
    },
    {
      id: "status",
      header: text.segmentStatusHeader,
      align: "center" as const,
      cell: (r: SegmentRow) =>
        r.status === "active" ? (
          <span>{text.segmentStatusLabel[r.status] ?? r.status}</span>
        ) : (
          <StatusBadge tone="warning">
            {text.segmentStatusLabel[r.status] ?? r.status}
          </StatusBadge>
        ),
    },
  ];
}

export function SegmentPanel({ rows }: { readonly rows: readonly SegmentRow[] }) {
  const { DATA_TABLE_LABELS, STRATEGY_TEXT } = useMessages();
  return (
    <Section id="segments" icon="target">
      {rows.length === 0 ? (
        <EmptyState
          title={STRATEGY_TEXT.segmentsNone}
          description={STRATEGY_TEXT.segmentsNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: SegmentRow) => r.id}
          rows={[...rows]}
          columns={segmentColumns(STRATEGY_TEXT)}
        />
      )}
    </Section>
  );
}
