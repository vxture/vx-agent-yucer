"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  DialogForm,
  EmptyState,
  Field,
  FieldLabel,
  FilterBar,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  type DataTableColumn,
} from "@vxture/design-ui";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  FilterSlot,
  rowClickSelection,
  SearchSlot,
  useTableSort,
} from "./table-fittings";
import { ROUTING_ANALYSE_EVENT } from "../lib/routing-signal";
import {
  LEAD_DISQUALIFY_REASONS,
  LEAD_TERMINATE_REASONS,
  type ExitReason,
} from "../../domains/shared/funnel-exit";
import type { LeadRecord } from "../../domains/signal/store";
import { useMessages } from "../lib/i18n/provider";
import { confidenceTone } from "../lib/view-model";
import type { LeadAction, LeadActionResult } from "../signal/lead-actions";
import { Tag } from "./tag";

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
  /** lead id -> why it ended, for the ones that did (incr/0033). */
  readonly exitReasons: ReadonlyMap<string, { reasonCode: string; note: string | null }>;
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
  /** 转化为商机, with the requirement the deal will be judged by (incr/0034). */
  readonly onConvert: (
    leadId: string,
    requirement: string,
  ) => Promise<{ ok: boolean; error?: string; opportunityNo?: string; attributionSource?: string }>;
  /** 判定不合格 / 终结 - both endings, with the reason that separates them. */
  readonly onEnd: (
    leadId: string,
    reasonCode: ExitReason,
    note: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
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

/* 排序取值: what each sortable column ORDERS ON, which is not always what
   it renders - a badge sorts on the score inside it, a money cell on the raw
   amount rather than its formatted string. */
const SORT_ON = {
    company: (r: LeadRecord) => r.companyName,
    score: (r: LeadRecord) => r.score,
  };

export function LeadList({
  regionOf,
  exitReasons,
  leads,
  attributionPreviews,
  canTriage,
  canConvert,
  onAct,
  onClaim,
  onRemove,
  onMatch,
  onEnd,
  onConvert,
  accounts,
}: LeadListProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    LEAD_STATUS_LABEL,
    EXIT_REASON_LABEL,
    LEAD_TEXT,
    PIPELINE_TEXT,
    SIGNAL_ACTION_ERROR,
  } = useMessages();
  const sorted = useTableSort<LeadRecord>([], SORT_ON);

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
  // list / cards, the tool row's leftmost control.
  const [view, setView] = useState<"list" | "cards">("list");

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
  // ENDING A LEAD ASKS FOR A REASON (incr/0033), so it is a dialog rather than
  // a confirm: a confirmation asks "are you sure", and what this needs is
  // "why". `kind` decides which of the two reason lists is offered.
  const [ending, setEnding] = useState<{ row: LeadRecord; kind: "disqualify" | "terminate" } | null>(
    null,
  );
  // 转化为商机 asks for the requirement, so it is a dialog too. A lead carries
  // nothing that answers "what do they want", and converting is the moment
  // somebody does know.
  const [converting, setConverting] = useState<LeadRecord | null>(null);
  const [requirement, setRequirement] = useState("");
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  // 表头检索与筛选 (owner, 2026-09-06).
  //
  // CLIENT-SIDE, and that is a decision with a limit worth stating: the page
  // reads up to 200 leads, so filtering here is filtering the whole set. Past
  // that the query belongs in listLeads, and this control would be lying about
  // what it searched.
  //
  // SEARCH COVERS WHAT THE READER CAN SEE - company, lead number, contact and
  // owner. Searching a field the table does not show produces hits nobody can
  // explain.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = leads.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    // THREE STATES, not two: any owner, nobody, or one person. "无人认领" is
    // the queue that cannot move at all - a lead nobody owns cannot be
    // qualified - so it is worth filtering to on its own.
    if (ownerFilter === "__none__" && l.ownerSub !== null) return false;
    if (ownerFilter && ownerFilter !== "__none__" && l.ownerSub !== ownerFilter) return false;
    if (!needle) return true;
    return [l.companyName, l.leadNo, l.contactName ?? "", l.ownerSub ?? ""].some((f) =>
      f.toLowerCase().includes(needle),
    );
  });

  // The owners actually present, so the filter never offers a name that would
  // return nothing.
  // Sorted with `localeCompare`, and here it MATTERS rather than being a
  // formality: this list is read by a person picking a name out of a dropdown.
  // Today the values are ASCII subject ids, where a bare `.sort()` agrees; the
  // day a display-name directory lands, a code-unit sort puts Chinese names in
  // an order no reader can follow.
  const owners = [
    ...new Set(leads.map((l) => l.ownerSub).filter((o): o is string => o !== null)),
  ].sort((a, b) => a.localeCompare(b));
  const remove = (id: string) => run(id, onRemove);

  const columns: readonly DataTableColumn<LeadRecord>[] = [
    {
      id: "company",
  sortable: true,
      header: LEAD_TEXT.columnCompany,
      // 主标题字号加大、加粗，副行是线索号与联系人 (owner, 2026-09-06). The only
      // left-aligned column; everything else is centred.
      cell: (row) => (
        <TableTitleCell
          title={row.companyName}
          description={`${row.leadNo}${row.contactName ? ` / ${row.contactName}` : ""}`}
          tooltip={row.companyName}
        />
      ),
    },
    {
      id: "score",
      header: LEAD_TEXT.columnScore,
      cell: (row) =>
        row.score == null ? (
          "-"
        ) : (
          <Tag tone={confidenceTone(row.score)}>
            {row.score}
          </Tag>
        ),
    },
    {
      id: "source",
      header: LEAD_TEXT.columnSource,
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
          <Tag tone={source === "campaign" ? "info" : "neutral"}>
            {SOURCE_LABEL[source] ?? source}
          </Tag>
        );
      },
    },
    {
      id: "region",
      header: LEAD_TEXT.columnRegion,
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
      cell: (row) => row.ownerSub ?? "-",
    },
    {
      id: "status",
      header: LEAD_TEXT.columnStatus,
      // THE REASON RIDES WITH THE STATUS (incr/0033). "判定不合格" alone is the
      // word the old schema could say; what a reader actually asks next is
      // why, and the answer is now recorded - so it is shown here rather than
      // filed somewhere nobody opens.
      cell: (row: LeadRecord) => {
        const exit = exitReasons.get(row.id);
        return (
          <span className="flex flex-col items-center gap-3xs">
            <Tag tone={row.status === "converted" ? "success" : "neutral"} dot>
              {LEAD_STATUS_LABEL[row.status] ?? row.status}
            </Tag>
            {exit ? (
              <span
                className="text-muted-foreground truncate text-body-sm"
                title={exit.note ?? undefined}
              >
                {EXIT_REASON_LABEL[exit.reasonCode] ?? exit.reasonCode}
              </span>
            ) : null}
          </span>
        );
      },    },
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
            onSelect: () => {
              setConverting(row);
              setRequirement("");
            },
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
            // A DIALOG, NOT A CONFIRMATION. A confirm box asks "are you sure";
            // what this needs is "why", and the reason is now required
            // (incr/0033). `confirmExempt` is the DS's way of saying a danger
            // item deliberately has no confirm box - and the reason it does
            // not is that the dialog it opens is a stronger gate than one.
            confirmExempt: LEAD_TEXT.exemptAsksReason,
            onSelect: () => {
              setEnding({ row, kind: "disqualify" });
              setReason("");
              setReasonNote("");
            },
          },
          {
            id: "terminate",
            label: LEAD_TEXT.terminate,
            danger: true,
            // 终结 - IT WAS REAL AND IT DIED: the budget went, somebody else
            // won it, the customer cancelled the project, it is not this year.
            // Different from 判定不合格 above, which says the demand was never
            // ours to win.
            //
            // Both end at `disqualified`, because that is the only terminal
            // state lead.status has. The REASON is what separates them, which
            // is why each opens its own list of reasons rather than the same
            // nine.
            disabled: terminal || !canTriage,
            hint: terminal
              ? LEAD_TEXT.hintTerminal
              : !canTriage
                ? LEAD_TEXT.hintNoTriage
                : LEAD_TEXT.hintTerminateWhy,
            confirmExempt: LEAD_TEXT.exemptAsksReason,
            onSelect: () => {
              setEnding({ row, kind: "terminate" });
              setReason("");
              setReasonNote("");
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
  const select = rowClickSelection(visible, (r) => r.id, selected, setSelected);

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
      {converting ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setConverting(null);
          }}
          title={LEAD_TEXT.convert}
          description={LEAD_TEXT.convertWhy(converting.companyName)}
          submitLabel={LEAD_TEXT.convert}
          cancelLabel={DS_LABELS.confirmCancel}
          submitting={pending}
          submitDisabled={requirement.trim() === ""}
          onSubmit={(e) => {
            e.preventDefault();
            const row = converting;
            const text = requirement.trim();
            setConverting(null);
            setBusyId(row.id);
            setError(null);
            startTransition(async () => {
              const r = await onConvert(row.id, text);
              if (!r.ok) {
                setError(SIGNAL_ACTION_ERROR[r.error ?? "denied"] ?? SIGNAL_ACTION_ERROR.denied);
              } else if (r.opportunityNo) {
                // Attribution is frozen from here. This is the only moment it
                // is worth stating, because it can never be changed after.
                setNote(
                  `${r.opportunityNo} - ${SOURCE_LABEL[r.attributionSource ?? ""] ?? r.attributionSource ?? ""}`,
                );
              }
              setBusyId(null);
            });
          }}
        >
          <Field>
            <FieldLabel>{LEAD_TEXT.convertRequirement}</FieldLabel>
            <Input
              value={requirement}
              placeholder={LEAD_TEXT.convertRequirementHint}
              onChange={(e) => setRequirement(e.target.value)}
            />
            <p className="text-muted-foreground text-body-sm">
              {LEAD_TEXT.convertRequirementWhy}
            </p>
          </Field>
        </DialogForm>
      ) : null}
      {ending ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setEnding(null);
          }}
          danger
          title={ending.kind === "disqualify" ? LEAD_TEXT.disqualify : LEAD_TEXT.terminate}
          description={
            ending.kind === "disqualify"
              ? LEAD_TEXT.disqualifyConsequence
              : LEAD_TEXT.terminateConsequence
          }
          submitLabel={LEAD_TEXT.endSubmit}
          cancelLabel={DS_LABELS.confirmCancel}
          submitting={pending}
          // 'other' HAS TO SAY WHAT. The rule refuses it and the database
          // refuses it; the button refusing it too is what stops the reader
          // meeting that as an error after the fact.
          submitDisabled={reason === "" || (reason === "other" && reasonNote.trim() === "")}
          onSubmit={(e) => {
            e.preventDefault();
            const { row } = ending;
            // The select's options come from the same two arrays the rule
            // validates against, so an invalid code cannot be chosen here -
            // and the rule refuses one anyway if it ever were.
            const code = reason as ExitReason;
            const text = reasonNote.trim() === "" ? null : reasonNote.trim();
            setEnding(null);
            run(row.id, (id) => onEnd(id, code, text));
          }}
        >
          <Field>
            <FieldLabel>{LEAD_TEXT.endReason}</FieldLabel>
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">{LEAD_TEXT.endReasonPick}</option>
              {(ending.kind === "disqualify"
                ? LEAD_DISQUALIFY_REASONS
                : LEAD_TERMINATE_REASONS
              ).map((r) => (
                <option key={r} value={r}>
                  {EXIT_REASON_LABEL[r] ?? r}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{LEAD_TEXT.endNote}</FieldLabel>
            <Input
              value={reasonNote}
              placeholder={
                reason === "other" ? LEAD_TEXT.endNoteRequired : LEAD_TEXT.endNoteOptional
              }
              onChange={(e) => setReasonNote(e.target.value)}
            />
          </Field>
        </DialogForm>
      ) : null}
      {note ? <StatusBadge tone="success">{note}</StatusBadge> : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {/* THE DS'S OWN TOOL ROW (design-ui `FilterBar`), not a hand-rolled one.
          I built this out of Field + Input + NativeSelect on 2026-09-06 and
          that was wrong twice over: CLAUDE.md says a missing element is a
          request to the DS rather than a local build, and the element was not
          even missing - FilterBar has shipped since before that, with exactly
          the slots the owner later specified.

          ITS LAYOUT IS THE SPEC. Left segment: view switch, then the count.
          Right segment: search first, then reset, then the filter group, then
          the actions - with the gap between the two segments doing the
          spacing. One row that compresses the search box before it wraps,
          which is behaviour the component owns rather than measurements I
          have to keep re-taking. */}
      {leads.length > 0 ? (
        <FilterBar
          view={view}
          onViewChange={setView}
          count={
            // SAYS WHAT IS FILTERED OUT, not just what is left. "6 条" beside a
            // narrowed list reads as the whole list to somebody who has
            // forgotten the filter is on.
            visible.length === leads.length
              ? PIPELINE_TEXT.rowCount(leads.length)
              : LEAD_TEXT.filteredCount(visible.length, leads.length)
          }
          // 量具在 table-fittings 里 (SearchSlot / FilterSlot)，理由写在那边：
          // FilterBar 的右段会换行，而换行是按 basis 断的，不是按 shrink 断的。
          search={
            <SearchSlot>
              <Input
                type="search"
                className="w-full"
                value={query}
                placeholder={LEAD_TEXT.searchHint}
                aria-label={LEAD_TEXT.searchLabel}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchSlot>
          }
          // RESET ONLY WHEN THERE IS SOMETHING TO RESET. A control that is
          // always there and usually does nothing teaches people to ignore it.
          onReset={
            query !== "" || statusFilter !== "" || ownerFilter !== ""
              ? () => {
                  setQuery("");
                  setStatusFilter("");
                  setOwnerFilter("");
                }
              : undefined
          }
          resetLabel={LEAD_TEXT.resetFilters}
        >
          <FilterSlot width="w-[7rem]">
            <NativeSelect
              value={statusFilter}
              aria-label={LEAD_TEXT.columnStatus}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{LEAD_TEXT.filterAllStatus}</option>
              {Object.entries(LEAD_STATUS_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FilterSlot>
          <FilterSlot>
            <NativeSelect
              value={ownerFilter}
              aria-label={LEAD_TEXT.columnOwner}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              <option value="">{LEAD_TEXT.filterAllOwners}</option>
              <option value="__none__">{LEAD_TEXT.filterUnowned}</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          </FilterSlot>
        </FilterBar>
      ) : null}

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
        visible.length === 0 ? (
        <EmptyState title={LEAD_TEXT.noMatch} description={LEAD_TEXT.noMatchWhy} />
      ) : (
        <div
          className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
          ref={select.ref}
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            columns={columns}
            rows={[...sorted.sortRows(visible)]}
            sort={sorted.sort}
            onSortChange={sorted.onSortChange}
            rowKey={(row) => row.id}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            rowActions={(row) => <LeadActions row={row} />}
          />
        </div>
      ))}
    </Section>
  );
}
