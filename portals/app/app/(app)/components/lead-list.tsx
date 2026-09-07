"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  DialogForm,
  Field,
  FieldLabel,
  NativeSelect,
  EmptyState,
  Section,
  StatusBadge,
  type DataTableColumn,
} from "@vxture/design-ui";
import { ACTION_COLUMN, EDGE_COLUMNS, rowClickSelection } from "./table-fittings";
import { ROUTING_ANALYSE_EVENT } from "../lib/routing-signal";
import type { LeadRecord } from "../../domains/signal/store";
import { useMessages } from "../lib/i18n/provider";
import { confidenceTone } from "../lib/view-model";
import type { LeadAction, LeadActionResult } from "../signal/lead-actions";

// The lead list, and the button that walks the attribution seam.
//
// Two things this surface is careful about:
//
//   - Convert is offered only for a QUALIFIED lead with an account. The rules
//     refuse otherwise, and rendering a button that is guaranteed to fail
//     teaches people to expect errors. An unmatched lead shows why instead.
//   - After a conversion it reports which attribution was recorded. That value
//     is frozen from this moment and can never be corrected through the
//     product, so the one time to show it is when it is decided.

export interface LeadListProps {
  readonly leads: readonly LeadRecord[];
  /** account id -> region. The fact 智能分配 turns on; a lead whose account has
   * none cannot be placed at all. */
  readonly regionOf: ReadonlyMap<string, string | null>;
  /**
   * What each qualified lead WOULD attribute to, computed by the rule layer
   * (previewAttribution) before anyone converts. Attribution freezes at
   * conversion and is uncorrectable afterwards (ADR-016), so the moment before
   * the click is the one moment this answer is worth anything.
   */
  readonly attributionPreviews: ReadonlyMap<string, { source: string; campaignId: string | null }>;
  readonly canTriage: boolean;
  readonly canConvert: boolean;
  /** 认领 - the caller takes it. No subject crosses the wire: a client that
   * could name the claimer could claim on somebody else's behalf. */
  readonly onClaim: (leadId: string) => Promise<{ ok: boolean; error?: string }>;
  /** 删除 - for a record that should never have existed. */
  readonly onRemove: (leadId: string) => Promise<{ ok: boolean; error?: string }>;
  /** 匹配客户 - the unblocker for assignment AND conversion. */
  readonly onMatch: (
    leadId: string,
    accountId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** The customers a lead can be matched to. */
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
  readonly onAct: (
    leadId: string,
    action: LeadAction,
  ) => Promise<LeadActionResult>;
}

export function LeadList({
  regionOf,
  leads,
  attributionPreviews,
  canTriage,
  canConvert,
  onAct,
  onClaim,
  onRemove,
  onMatch,
  accounts,
}: LeadListProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    LEAD_STATUS_LABEL,
    LEAD_TEXT,
    PIPELINE_TEXT,
    SIGNAL_ACTION_ERROR,
  } = useMessages();

  // Built here rather than at module scope: it is made OF copy, and copy now
  // depends on the request's locale. A module-level map would have frozen one
  // language at import time - the same trap as a static messages import, just
  // one indirection further away.
  const SOURCE_LABEL: Record<string, string> = {
    campaign: LEAD_TEXT.sourceCampaign,
    signal_campaign: LEAD_TEXT.sourceSignalCampaign,
    self_sourced: LEAD_TEXT.sourceSelf,
  };

  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 选择列的状态 - one of the three standard fittings, and what 删除线索 acts on.
  const [selected, setSelected] = useState<readonly string[]>([]);

  function act(id: string, action: LeadAction) {
    setBusyId(id);
    setNote(null);
    setError(null);
    startTransition(() => {
      void onAct(id, action)
        .then((r) => {
          // A refusal used to vanish here: only the success branch was read,
          // so a failed conversion left the screen exactly as it was. Silence
          // is worse than a wrong sentence - the user retries, then blames the
          // click, then the product (TD-010 sweep).
          if (!r.ok) {
            setError(SIGNAL_ACTION_ERROR[r.error ?? "denied"] ?? SIGNAL_ACTION_ERROR.not_found);
            return;
          }
          if (r.ok && r.opportunityNo) {
            // Attribution is frozen from here. This is the only moment it is
            // worth stating, because it can never be changed afterwards.
            setNote(
              `${r.opportunityNo} - ${SOURCE_LABEL[r.attributionSource ?? ""] ?? r.attributionSource ?? ""}`,
            );
          }
        })
        .finally(() => setBusyId(null));
    });
  }

  /** One-shot writes that only need "did it land". */
  const run = (
    id: string,
    fn: (leadId: string) => Promise<{ ok: boolean; error?: string }>,
  ) => {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const r = await fn(id);
      if (!r.ok) setError(SIGNAL_ACTION_ERROR[r.error ?? "denied"] ?? SIGNAL_ACTION_ERROR.denied);
      setBusyId(null);
    });
  };
  const claim = (id: string) => run(id, onClaim);
  // 匹配客户 needs a SECOND value, so it gets a dialog rather than a menu item
  // that fires immediately. Which customer this lead is cannot be guessed - a
  // company name is not an identity (ADR-024's argument, one level down).
  const [matching, setMatching] = useState<LeadRecord | null>(null);
  const [matchTo, setMatchTo] = useState("");
  const remove = (id: string) => run(id, onRemove);

  const columns: readonly DataTableColumn<LeadRecord>[] = [
    {
      id: "company",
      header: LEAD_TEXT.columnCompany,
      // 主标题字号加大、加粗，副行是线索号与联系人 (owner, 2026-09-06). The only
      // left-aligned column; everything else is centred.
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate text-body-lg font-semibold">
            {row.companyName}
          </span>
          <span className="text-muted-foreground truncate text-body-sm tabular-nums">
            {row.leadNo}
            {row.contactName ? ` / ${row.contactName}` : ""}
          </span>
        </span>
      ),
    },
    {
      id: "score",
      header: LEAD_TEXT.columnScore,
      align: "center",
      cell: (row) =>
        row.score == null ? (
          "-"
        ) : (
          <StatusBadge tone={confidenceTone(row.score)}>
            {row.score}
          </StatusBadge>
        ),
    },
    {
      id: "source",
      header: LEAD_TEXT.columnSource,
      align: "center" as const,
      // The RULE's answer where it has one. This cell used to re-derive the
      // attribution client-side (campaignId ? campaign : signalId ? ... ), a
      // second implementation of resolveAttribution that could drift from what
      // conversion would actually freeze. For qualified leads the rule is
      // asked; for the rest the derivation stays, labelled by the same map.
      cell: (row) => {
        const preview = attributionPreviews.get(row.id);
        const source = preview
          ? preview.source
          : row.campaignId
            ? "campaign"
            : row.signalId
              ? "signal_campaign"
              : "self_sourced";
        return (
          <StatusBadge tone={source === "campaign" ? "info" : "neutral"}>
            {SOURCE_LABEL[source] ?? source}
          </StatusBadge>
        );
      },
    },
    {
      id: "region",
      header: LEAD_TEXT.columnRegion,
      align: "center" as const,
      // WHAT ASSIGNMENT TURNS ON. A territory covers regions and nothing else,
      // so a lead with no region cannot be placed by 智能分配 - and this is the
      // only column on the page that says why. It arrived when 分派 folded into
      // this module (owner, 2026-09-06).
      cell: (row: LeadRecord) => {
        const region = row.accountId ? (regionOf.get(row.accountId) ?? null) : null;
        return region ? (
          <span className="text-body-sm">{region}</span>
        ) : (
          <span className="text-(color:--warning-text) text-body-sm">
            {LEAD_TEXT.noRegion}
          </span>
        );
      },
    },
    {
      id: "owner",
      header: LEAD_TEXT.columnOwner,
      align: "center" as const,
      cell: (row) => row.ownerSub ?? "-",
    },
    {
      id: "status",
      header: LEAD_TEXT.columnStatus,
      align: "center" as const,
      cell: (row) => (
        <StatusBadge
          tone={row.status === "converted" ? "success" : "neutral"}
          dot
        >
          {LEAD_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  /* Every verb stays in the menu and the unusable ones say why, rather than the
     row silently offering a different set each time. A menu whose contents
     change per row teaches nobody what the product can do, and "why is this
     greyed out" is answerable where "why is it missing" is not - which matters
     most for convert, whose refusal has a real cause the reader can act on. */
  function LeadActions({ row }: { row: LeadRecord }) {
    const busy = pending && busyId === row.id;
    const terminal =
      row.status === "converted" || row.status === "disqualified";
    const qualified = row.status === "qualified";

    return (
      <ActionMenu
        label={DS_LABELS.actionMenu}
        disabled={busy}
        items={[
          {
            id: "work",
            label: LEAD_TEXT.startWork,
            // 开始跟进 - SOMEBODY HAS ACTUALLY STARTED. It is the difference
            // between a lead sitting in the pool and one being worked, and
            // without it a lead jumps from 新线索 straight to a judgement, so
            // the queue cannot tell "nobody has looked at this" from "looked
            // at and not yet decided".
            disabled: terminal || !canTriage || row.status !== "new",
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : row.status !== "new"
                  ? LEAD_TEXT.hintAlreadyWorking
                  : undefined,
            onSelect: () => act(row.id, "work"),
          },
          {
            id: "qualify",
            label: LEAD_TEXT.qualify,
            // UNOWNED CANNOT QUALIFY (owner, 2026-09-06). Qualifying is the
            // judgement that this is real and worth pursuing, and a judgement
            // nobody owns is one nobody made. The rule refuses it; saying so
            // here means the reader learns the condition instead of meeting it
            // as an error - and the hint names the page that fixes it.
            disabled: terminal || !canTriage || qualified || !row.ownerSub,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : qualified
                  ? LEAD_TEXT.hintAlreadyQualified
                  : !row.ownerSub
                    ? LEAD_TEXT.hintNoOwner
                    : undefined,
            onSelect: () => act(row.id, "qualify"),
          },
          {
            id: "convert",
            label: LEAD_TEXT.convert,
            disabled: terminal || !canConvert || !qualified || !row.accountId,
            // The rule refuses without an account. Say why rather than offering
            // something guaranteed to fail.
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canConvert
                ? LEAD_TEXT.hintNoConvert
                : !qualified
                  ? LEAD_TEXT.hintNotQualified
                  : !row.accountId
                    ? LEAD_TEXT.needAccount
                    : undefined,
            onSelect: () => act(row.id, "convert"),
          },
          {
            id: "claim",
            label: LEAD_TEXT.claim,
            // 认领 - A REP PICKING IT UP THEMSELVES, without waiting for
            // anybody to route it. Offered only on an unowned lead: on an
            // owned one "taking it" is somebody else's lead being taken, and
            // that is a handover, which is the item below.
            disabled: terminal || !canTriage || row.ownerSub !== null,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : row.ownerSub !== null
                  ? LEAD_TEXT.hintAlreadyOwned
                  : undefined,
            onSelect: () => claim(row.id),
          },
          {
            id: "assign",
            // 分派 / 转让 - THE SAME WRITE, TWO MOMENTS, and the label says
            // which: handing out an unowned lead is 分派, moving an owned one
            // is 转让负责人. Both open 智能分配, which is where a person is
            // chosen by territory and load rather than by memory.
            label: row.ownerSub ? LEAD_TEXT.handOver : LEAD_TEXT.assign,
            disabled: terminal || !canTriage,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : LEAD_TEXT.hintAssignOpensPanel,
            onSelect: () =>
              window.dispatchEvent(new CustomEvent(ROUTING_ANALYSE_EVENT)),
          },
          {
            id: "match",
            label: LEAD_TEXT.matchAccount,
            separatorBefore: true,
            // 匹配客户 - THE UNBLOCKER FOR TWO REFUSALS. No account means no
            // region, so 智能分配 cannot place it; and no account means no
            // conversion, because a deal must belong to a customer. Both of
            // those point here, so the item stays visible on a matched lead
            // and says why it is grey.
            disabled: terminal || !canTriage || row.accountId !== null,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : row.accountId !== null
                  ? LEAD_TEXT.hintAlreadyMatched
                  : undefined,
            onSelect: () => {
              setMatching(row);
              setMatchTo("");
            },
          },
          {
            id: "account",
            label: LEAD_TEXT.openAccount,
            disabled: !row.accountId,
            hint: !row.accountId ? LEAD_TEXT.needAccount : undefined,
            onSelect: () => {
              window.location.href = `/account/${encodeURIComponent(row.accountId!)}`;
            },
          },
          {
            id: "disqualify",
            label: LEAD_TEXT.disqualify,
            danger: true,
            separatorBefore: true,
            // 判定不合格 - OUR JUDGEMENT THAT IT IS NOT A FIT: wrong industry,
            // wrong size, a need we do not serve. It KEEPS the record, which
            // is the whole difference from 删除 below: a lead that was real
            // and went nowhere stays in the denominator every funnel rate is
            // measured against.
            //
            // No owner is required for it. "This is not real" is a conclusion
            // anybody can reach, and refusing it would trap junk in the queue
            // until somebody was assigned to throw it away.
            disabled: terminal || !canTriage,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : undefined,
            // GUARDED, not exempt. design-ui 5.0 makes every danger item choose
            // between a confirmation and a written reason for not having one,
            // and this action does not qualify for the exemption: the list
            // treats disqualified as terminal, so it is one-way from here.
            //
            // No onSelect - the type forbids it alongside confirm, because
            // wiring both fires both.
            confirm: {
              verb: LEAD_TEXT.disqualify,
              target: LEAD_TEXT.disqualifyTarget(row.companyName),
              consequence: LEAD_TEXT.disqualifyConsequence,
              titleTemplate: DS_LABELS.confirmTitleTemplate,
              cancelLabel: DS_LABELS.confirmCancel,
              pendingLabel: DS_LABELS.confirmPending,
              onConfirm: () => act(row.id, "disqualify"),
            },
          },
          {
            id: "remove",
            label: LEAD_TEXT.remove,
            danger: true,
            // 删除 - A DIFFERENT THING FROM 判定不合格, and the two sit next to
            // each other so the difference has to be said. Disqualifying keeps
            // the record; deleting says the record should never have existed -
            // a duplicate, a mis-typed company - so it leaves no trace and is
            // counted by nothing.
            //
            // A CONVERTED LEAD CANNOT GO. It is the only record of where its
            // deal came from, and the attribution on that deal is frozen
            // (ADR-016). The rule refuses it; this says so before the click.
            disabled: !canTriage || row.status === "converted",
            hint: !canTriage
              ? LEAD_TEXT.hintNoTriage
              : row.status === "converted"
                ? LEAD_TEXT.hintConvertedKept
                : undefined,
            confirm: {
              verb: LEAD_TEXT.remove,
              target: LEAD_TEXT.disqualifyTarget(row.companyName),
              consequence: LEAD_TEXT.removeConsequence,
              titleTemplate: DS_LABELS.confirmTitleTemplate,
              cancelLabel: DS_LABELS.confirmCancel,
              pendingLabel: DS_LABELS.confirmPending,
              onConfirm: () => remove(row.id),
            },
          },
        ]}
      />
    );
  }

  // 选择列 - one of the three standard fittings. Row click toggles it; the
  // checkbox alone is too small to aim at (owner, 2026-09-06).
  const select = rowClickSelection(leads, (r) => r.id, selected, setSelected);

  return (
    <Section
      icon="lightbulb"
      title={LEAD_TEXT.title}
      description={LEAD_TEXT.description}
      action={
        <span className="flex items-center gap-xs">
          {/* 表格级操作 (owner, 2026-09-06). 添加线索 is always offered - a lead
              from a stand or a phone call has no signal behind it, and before
              this the only way one could exist was for the machine to find it.
              删除 acts on the SELECTION, so it appears only when there is one:
              a destructive control with nothing to destroy is a trap. */}
          {canTriage ? (
            <Button size="sm" variant="secondary" onClick={() => (window.location.href = "/lead/new")}>
              {LEAD_TEXT.addLead}
            </Button>
          ) : null}
          {canTriage && selected.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  // ONE AT A TIME, and the loop is here rather than in the
                  // action: each row has its own rule (a converted lead is
                  // refused), so one round trip would report one outcome for
                  // many different answers.
                  let refused = 0;
                  for (const id of selected) {
                    const r = await onRemove(id);
                    if (!r.ok) refused += 1;
                  }
                  setSelected([]);
                  setError(refused > 0 ? LEAD_TEXT.bulkRefused(refused) : null);
                })
              }
            >
              {LEAD_TEXT.deleteSelected(selected.length)}
            </Button>
          ) : null}
        </span>
      }
    >
      {matching ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setMatching(null);
          }}
          title={LEAD_TEXT.matchAccount}
          description={LEAD_TEXT.matchWhy(matching.companyName)}
          submitLabel={LEAD_TEXT.matchSubmit}
          cancelLabel={DS_LABELS.confirmCancel}
          submitting={pending}
          submitDisabled={matchTo === ""}
          onSubmit={(e) => {
            e.preventDefault();
            const lead = matching;
            const account = matchTo;
            setMatching(null);
            run(lead.id, (id) => onMatch(id, account));
          }}
        >
          <Field>
            <FieldLabel>{LEAD_TEXT.columnAccount}</FieldLabel>
            <NativeSelect value={matchTo} onChange={(e) => setMatchTo(e.target.value)}>
              <option value="">{LEAD_TEXT.matchPick}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </DialogForm>
      ) : null}
      {note ? <StatusBadge tone="success">{note}</StatusBadge> : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {leads.length === 0 ? (
        <EmptyState
          title={LEAD_TEXT.emptyTitle}
          description={LEAD_TEXT.emptyDescription}
        />
      ) : (
        /* NO OUTER CARD (owner, 2026-09-06). The Section already draws this
           block; a card inside it was a second frame around the same content,
           and the table's own borders make a third.

           除了固定的，其余均分: 选择 / 序号 / 操作 carry a width and no other
           column does, so under table-fixed the browser shares out the rest in
           equal parts by itself. */
        <div
          className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
          ref={select.ref}
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            columns={columns}
            rows={[...leads]}
            rowKey={(row) => row.id}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            rowActions={(row) => <LeadActions row={row} />}
          />
        </div>
      )}
    </Section>
  );
}
