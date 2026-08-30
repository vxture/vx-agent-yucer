"use client";

import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useSaveAction } from "../lib/use-save-action";
import { SaveRow } from "./save-row";

// Where each open lead WOULD go, and one button per lead to make it so.
//
// A PREVIEW, NOT A ROUTER THAT RAN. Assignment moves work between people, and
// the case somebody must see before it lands is precisely the one where the
// rule reaches a wrong answer - a territory nobody finished configuring, a
// region no territory covers. Applying is per-row for the same reason: the
// owner of a lead is who gets asked about it, so this is many decisions, not
// one batch wearing a batch's costume.
//
// UNROUTABLE ROWS STAY IN THE LIST. They are the ones that need somebody to
// fix the territory map, and hiding them would make the map look complete
// while leads quietly went nowhere.

export interface RoutingRow {
  readonly leadId: string;
  readonly leadNo: string;
  readonly companyName: string;
  readonly currentOwner: string | null;
  readonly suggestedOwner: string | null;
  /** The rule's own words for why, or the reason it could not decide. */
  readonly basis: string;
  readonly unroutableReason: string | null;
}

export interface RoutingTableProps {
  readonly rows: readonly RoutingRow[];
  readonly canAssign: boolean;
  readonly onAssign: (input: {
    leadId: string;
    ownerSub: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function RoutingTable({ rows, canAssign, onAssign }: RoutingTableProps) {
  const { DATA_TABLE_LABELS, ROUTING_TEXT, SIGNAL_ACTION_ERROR } = useMessages();
  const save = useSaveAction(SIGNAL_ACTION_ERROR);

  return (
    <Section id="routing" icon="user-switch" title={ROUTING_TEXT.title} description={ROUTING_TEXT.why}>
      {rows.length === 0 ? (
        <EmptyState title={ROUTING_TEXT.none} description={ROUTING_TEXT.noneWhy} />
      ) : (
        <>
          <DataTable
            labels={DATA_TABLE_LABELS}
            rowKey={(r: RoutingRow) => r.leadId}
            rows={[...rows]}
            columns={[
              {
                id: "lead",
                header: ROUTING_TEXT.colLead,
                cell: (r: RoutingRow) => (
                  <div className="flex flex-col gap-3xs">
                    <span className="text-foreground">{r.companyName}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">{r.leadNo}</span>
                  </div>
                ),
              },
              {
                id: "current",
                header: ROUTING_TEXT.colCurrent,
                cell: (r: RoutingRow) =>
                  r.currentOwner ? (
                    <span className="text-muted-foreground font-mono text-xs">{r.currentOwner}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">{ROUTING_TEXT.unowned}</span>
                  ),
              },
              {
                id: "suggested",
                header: ROUTING_TEXT.colSuggested,
                cell: (r: RoutingRow) =>
                  r.unroutableReason ? (
                    <StatusBadge tone="warning">
                      {ROUTING_TEXT.unroutable[r.unroutableReason] ?? r.unroutableReason}
                    </StatusBadge>
                  ) : r.suggestedOwner === r.currentOwner ? (
                    // Already where the rule would put it. Saying so beats an
                    // apply button that changes nothing.
                    <span className="text-muted-foreground text-xs">{ROUTING_TEXT.alreadyThere}</span>
                  ) : (
                    <span className="text-foreground font-mono text-xs">{r.suggestedOwner}</span>
                  ),
              },
              {
                id: "basis",
                header: ROUTING_TEXT.colBasis,
                // THE RULE'S REASONING, shown rather than summarised. "Why did
                // this go to me" is the question a router is actually asked,
                // and a page that cannot answer it gets overridden by hand
                // until nobody trusts it.
                cell: (r: RoutingRow) => (
                  <span className="text-muted-foreground text-xs">{r.basis}</span>
                ),
              },
              {
                id: "apply",
                header: ROUTING_TEXT.colApply,
                align: "center" as const,
                cell: (r: RoutingRow) =>
                  !canAssign || r.unroutableReason || r.suggestedOwner === r.currentOwner ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <SaveRow
                      action={save}
                      label={ROUTING_TEXT.apply}
                      savedLabel={ROUTING_TEXT.applied}
                      onSave={() =>
                        save.run(() =>
                          onAssign({ leadId: r.leadId, ownerSub: r.suggestedOwner! }),
                        )
                      }
                    />
                  ),
              },
            ]}
          />
          {!canAssign ? (
            <p className="text-muted-foreground mt-sm text-xs">{ROUTING_TEXT.denied}</p>
          ) : null}
        </>
      )}
    </Section>
  );
}
