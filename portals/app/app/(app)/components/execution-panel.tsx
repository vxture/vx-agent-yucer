"use client";

import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The work a campaign is made of - DISPLAY ONLY since 2026-09-05.
//
// The create/edit form left for /campaign/new (owner ruling). What remains is
// the table and the sentence under it, because the stake is the table's to
// state: an outstanding item blocks its campaign's completion.
//
// `campaign.execution.upsert` shipped in batch 1 with nothing behind it
// (TD-016), and this one was not merely unfinished - it was LOCKING something.
// `canCompleteCampaign` refuses to complete a campaign while any execution is
// outstanding, and nothing in the product could move an execution to done or
// skipped. A campaign with one pending item could never be completed, by
// anyone. Measured before this was built: camp_demo_1 (done/done/pending) was
// refused with `executions_outstanding`; camp_demo_3 (done) completed.
//
// The rows were already being read - campaignReturn loads them and summarised
// them into the "2/3 完成" figure the table above shows - and then threw them
// away, because there was nowhere for them to go.

function ExecutionStatusCell({
  status,
  labels,
}: {
  readonly status: string;
  readonly labels: Record<string, string>;
}) {
  // Only the two that still owe something get a badge. `done` and `skipped` are
  // settled, and a column of badges on settled rows hides the ones that block
  // the campaign.
  if (status === "pending" || status === "in_progress") {
    return <StatusBadge tone="warning">{labels[status] ?? status}</StatusBadge>;
  }
  return <span className="text-muted-foreground">{labels[status] ?? status}</span>;
}

export interface ExecutionRow {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignStatus: string;
  readonly title: string;
  readonly actionType: string;
  readonly assigneeSub: string | null;
  readonly dueAt: string | null;
  readonly status: string;
}

export function ExecutionPanel({ rows }: { readonly rows: readonly ExecutionRow[] }) {
  const { DATA_TABLE_LABELS, CAMPAIGN_TEXT } = useMessages();
  return (
    <Section
      id="executions"
      icon="list-checks"
      title={CAMPAIGN_TEXT.executionsTitle}
      description={CAMPAIGN_TEXT.executionsWhy}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={CAMPAIGN_TEXT.executionsNone}
          description={CAMPAIGN_TEXT.executionsNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: ExecutionRow) => r.id}
          rows={[...rows]}
          columns={executionColumns(CAMPAIGN_TEXT)}
        />
      )}
      <p className="text-muted-foreground mt-sm text-body-sm">{CAMPAIGN_TEXT.executionBlocks}</p>
    </Section>
  );
}

/** Columns at module scope with the dictionary passed in - see milestone-panel. */
function executionColumns(text: {
  executionCampaign: string;
  executionTitle: string;
  executionType: string;
  executionAssignee: string;
  executionDue: string;
  executionStatus: string;
  executionTypeLabel: Record<string, string>;
  executionStatusLabel: Record<string, string>;
}) {
  return [
    { id: "campaign", header: text.executionCampaign, cell: (r: ExecutionRow) => r.campaignName },
    { id: "title", header: text.executionTitle, cell: (r: ExecutionRow) => r.title },
    {
      id: "type",
      header: text.executionType,
      cell: (r: ExecutionRow) => text.executionTypeLabel[r.actionType] ?? r.actionType,
    },
    {
      id: "assignee",
      header: text.executionAssignee,
      cell: (r: ExecutionRow) => r.assigneeSub ?? "",
    },
    { id: "due", header: text.executionDue, cell: (r: ExecutionRow) => r.dueAt ?? "" },
    {
      id: "status",
      header: text.executionStatus,
      align: "center" as const,
      cell: (r: ExecutionRow) => (
        <ExecutionStatusCell status={r.status} labels={text.executionStatusLabel} />
      ),
    },
  ];
}
