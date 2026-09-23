"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Button,
  ConfirmDestructive,
  Drawer,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  PanelCard,
  PanelItem,
  PanelList,
  StatusBadge,
  useToast,
  type StatusBadgeTone,
} from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import type { InstalledRevenue } from "../../domains/delivery/lib/contract";
import { Tag } from "./tag";
import { useAccountEdit } from "./account-edit-context";

// 阵地清单「合同」tab (incr/0076, L4 batch one).
//
// ONE CARD, NOT TWO (owner, 2026-09-22): contracts, their lines and 已购态 all
// answer "what does this customer hold right now", so they live in one tab of
// the existing roster rather than as a 合同总览 card beside a 已购态 card.
// 白地 joins it in batch six, renewal lineage in batch two.
//
// DISPLAY AND EDIT ARE SEPARATE: the tab shows, and every change opens a
// Drawer from a button - never a form inline in the roster.
//
// THREE EMPTY STATES THAT ARE NOT ONE (design Q2.3): refused, failed to read,
// and genuinely none each say their own sentence. "No data" for all three is
// how a page lies.

export type ContractPhase = "draft" | "pending" | "in_force" | "lapsed" | "renewed" | "terminated";

export interface ContractLineRow {
  readonly id: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly currency: string;
  readonly termEnd: string | null;
}

export interface ContractRow {
  readonly id: string;
  readonly contractNo: string;
  readonly name: string;
  readonly status: string;
  readonly phase: ContractPhase;
  readonly opportunityId: string | null;
  readonly totalAmount: number | null;
  readonly currency: string;
  readonly termStart: string | null;
  readonly termEnd: string | null;
  readonly daysLeft: number | null;
  readonly noticeBy: string | null;
  readonly noticeDays: number;
  readonly signedAt: string | null;
  readonly lines: readonly ContractLineRow[];
  /** Null when the lines are not in one currency - never summed across. */
  readonly lineTotal: number | null;
  /** Batch two lineage: the contract this one renewed, and the one that renewed it. */
  readonly renewedFromNo: string | null;
  readonly renewedByNo: string | null;
  /** The whole renewal chain (contract numbers, oldest first) and where this
   *  one sits in it. A chain of one is not shown. */
  readonly lineage: { readonly chainNos: readonly string[]; readonly position: number };
  readonly events: readonly RenewalEventRow[];
}

export interface RenewalEventRow {
  readonly id: string;
  readonly eventType: "renewed" | "downgraded" | "lost";
  readonly successorNo: string | null;
  readonly reason: string | null;
  readonly occurredAt: string;
  readonly actorName: string | null;
}

export interface OwnedRow {
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: number;
  readonly runsUntil: string | null;
}

export type ContractReadState =
  | { readonly kind: "ok" }
  | { readonly kind: "refused"; readonly text: string }
  | { readonly kind: "failed" };

type Result = Promise<{ ok: boolean; error?: string }>;

export interface ContractRosterProps {
  readonly accountId: string;
  readonly read: ContractReadState;
  readonly contracts: readonly ContractRow[];
  readonly owned: readonly OwnedRow[];
  /** 存量收入 - see domains/delivery/lib/contract.ts installedRevenue. */
  readonly revenue: InstalledRevenue;
  /** L4 batch six - sellable minus owned; `unknown` when the catalogue is. */
  readonly whitespace?:
    | { readonly state: "known"; readonly items: ReadonlyArray<{ id: string; name: string }> }
    | { readonly state: "unknown" };
  readonly products: ReadonlyArray<{ id: string; name: string }>;
  readonly deals: ReadonlyArray<{ id: string; name: string }>;
  readonly defaultCurrency: string;
  readonly canWrite: boolean;
  readonly onSaveContract: (input: {
    contractId: string | null;
    accountId: string;
    contractNo: string;
    name: string;
    opportunityId: string | null;
    status: string;
    totalAmount: number | null;
    currency: string;
    termStart: string | null;
    termEnd: string | null;
    noticeDays: number;
    signedAt: string | null;
  }) => Result;
  readonly onSaveLine: (input: {
    accountId: string;
    contractId: string;
    lineId: string | null;
    productId: string;
    quantity: number;
    unitPrice: number;
    termEnd: string | null;
  }) => Result;
  readonly onRemoveLine: (input: { accountId: string; contractId: string; lineId: string }) => Result;
  /** delivery.contract.renew - separate from canWrite, it is its own action. */
  readonly canRenew: boolean;
  readonly onRenew: (input: {
    fromId: string;
    accountId: string;
    contractNo: string;
    name: string;
    opportunityId: string | null;
    status: string;
    totalAmount: number | null;
    currency: string;
    termStart: string | null;
    termEnd: string | null;
    noticeDays: number;
    signedAt: string | null;
  }) => Result;
  readonly onRecordOutcome: (input: {
    accountId: string;
    contractId: string;
    eventType: string;
    reason: string;
  }) => Result;
}

type DrawerTarget = { mode: "new" } | { mode: "edit" | "renew"; row: ContractRow };

const PHASE_TONE: Record<ContractPhase, StatusBadgeTone> = {
  draft: "neutral",
  pending: "info",
  in_force: "success",
  lapsed: "warning",
  renewed: "info",
  terminated: "neutral",
};

export function ContractRoster(props: ContractRosterProps) {
  const { CONTRACT_TEXT, CONTRACT_ERROR } = useMessages();
  const locale = useLocale();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<DrawerTarget | null>(null);
  // The roster's "⋮ 编辑" on the 合同 tab asks for 录入合同 (owner,
  // 2026-09-23) - the same drawer as the button inside this card.
  const accountEdit = useAccountEdit();
  const createSeq = accountEdit?.contractCreateSeq ?? 0;
  useEffect(() => {
    if (createSeq > 0 && props.canWrite) setEditing({ mode: "new" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSeq]);
  const [outcomeFor, setOutcomeFor] = useState<ContractRow | null>(null);
  const [lineFor, setLineFor] = useState<{ contract: ContractRow; line: ContractLineRow | null } | null>(null);
  const [removing, setRemoving] = useState<{ contract: ContractRow; line: ContractLineRow } | null>(null);

  const phaseLabel: Record<ContractPhase, string> = {
    draft: CONTRACT_TEXT.phaseDraft,
    pending: CONTRACT_TEXT.phasePending,
    in_force: CONTRACT_TEXT.phaseInForce,
    lapsed: CONTRACT_TEXT.phaseLapsed,
    renewed: CONTRACT_TEXT.phaseRenewed,
    terminated: CONTRACT_TEXT.phaseTerminated,
  };
  const eventText = (e: RenewalEventRow) =>
    e.eventType === "renewed"
      ? CONTRACT_TEXT.eventRenewed(e.successorNo ?? "")
      : e.eventType === "downgraded"
        ? CONTRACT_TEXT.eventDowngraded
        : CONTRACT_TEXT.eventLost;
  const productName = (name: string | null) => name ?? CONTRACT_TEXT.unknownProduct;
  const refuse = (error?: string) =>
    toast({ tone: "danger", title: CONTRACT_ERROR[error ?? "denied"] ?? CONTRACT_ERROR.denied });

  if (props.read.kind === "refused") {
    return <p className="text-muted-foreground text-body-sm">{props.read.text}</p>;
  }
  if (props.read.kind === "failed") {
    return <p className="text-destructive-text text-body-sm">{CONTRACT_TEXT.readFailed}</p>;
  }

  const remove = (target: { contract: ContractRow; line: ContractLineRow }) =>
    start(async () => {
      const r = await props.onRemoveLine({
        accountId: props.accountId,
        contractId: target.contract.id,
        lineId: target.line.id,
      });
      if (!r.ok) {
        refuse(r.error);
        return;
      }
      toast({ tone: "success", title: CONTRACT_TEXT.removed });
      setRemoving(null);
    });

  return (
    <div className="flex flex-col gap-md">
      {props.canWrite ? (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditing({ mode: "new" })}>
            {CONTRACT_TEXT.add}
          </Button>
        </div>
      ) : null}

      {props.contracts.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{CONTRACT_TEXT.empty}</p>
      ) : (
        <>
          <PanelCard title={CONTRACT_TEXT.revenueTitle} description={CONTRACT_TEXT.revenueHint}>
            {props.revenue.rows.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{CONTRACT_TEXT.revenueNone}</p>
            ) : (
              <PanelList>
                {props.revenue.rows.flatMap((r) => [
                  <PanelItem
                    key={`${r.currency}-annualized`}
                    main={<span className="text-foreground text-body-sm">{CONTRACT_TEXT.revenueAnnualized(r.inForce)}</span>}
                    trail={<span className="text-body-sm tabular-nums">{formatMoney(r.annualized, r.currency, locale)}</span>}
                  />,
                  <PanelItem
                    key={`${r.currency}-lifetime`}
                    main={<span className="text-foreground text-body-sm">{CONTRACT_TEXT.revenueLifetime(r.signed)}</span>}
                    trail={<span className="text-body-sm tabular-nums">{formatMoney(r.lifetime, r.currency, locale)}</span>}
                  />,
                ])}
              </PanelList>
            )}
            {props.revenue.unpriced > 0 ? (
              <p className="mt-xs text-muted-foreground text-body-sm">{CONTRACT_TEXT.revenueUnpriced(props.revenue.unpriced)}</p>
            ) : null}
          </PanelCard>

          <PanelCard title={CONTRACT_TEXT.ownedTitle} description={CONTRACT_TEXT.ownedHint}>
            {props.owned.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{CONTRACT_TEXT.ownedEmpty}</p>
            ) : (
              <PanelList>
                {props.owned.map((o) => (
                  <PanelItem
                    key={o.productId}
                    main={<span className="text-foreground text-body-sm">{productName(o.productName)}</span>}
                    trail={
                      <span className="flex items-center gap-xs text-body-sm tabular-nums">
                        <span>{CONTRACT_TEXT.qty(String(o.quantity))}</span>
                        {o.runsUntil ? <Tag>{CONTRACT_TEXT.lineUntil(o.runsUntil)}</Tag> : null}
                      </span>
                    }
                  />
                ))}
              </PanelList>
            )}
          </PanelCard>

          {props.whitespace ? (
            <PanelCard title={CONTRACT_TEXT.whitespaceTitle} description={CONTRACT_TEXT.whitespaceHint}>
              {props.whitespace.state === "unknown" ? (
                <p className="text-muted-foreground text-body-sm">{CONTRACT_TEXT.whitespaceUnknown}</p>
              ) : props.whitespace.items.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">{CONTRACT_TEXT.whitespaceNone}</p>
              ) : (
                <div className="flex flex-wrap gap-xs">
                  {props.whitespace.items.map((p) => (
                    <Tag key={p.id}>{p.name}</Tag>
                  ))}
                </div>
              )}
            </PanelCard>
          ) : null}

          {props.contracts.map((c) => (
            <PanelCard
              key={c.id}
              tone={PHASE_TONE[c.phase]}
              title={
                <span className="inline-flex items-center gap-xs">
                  <span>{c.name}</span>
                  <span className="text-muted-foreground text-body-sm font-normal">{c.contractNo}</span>
                </span>
              }
              action={
                <span className="flex items-center gap-xs">
                  <StatusBadge tone={PHASE_TONE[c.phase]}>{phaseLabel[c.phase]}</StatusBadge>
                  {props.canRenew && c.status === "active" && !c.renewedByNo ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ mode: "renew", row: c })}>
                      {CONTRACT_TEXT.renew}
                    </Button>
                  ) : null}
                  {props.canRenew && c.status !== "draft" ? (
                    <Button size="sm" variant="ghost" onClick={() => setOutcomeFor(c)}>
                      {CONTRACT_TEXT.recordOutcome}
                    </Button>
                  ) : null}
                  {props.canWrite ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ mode: "edit", row: c })}>
                      {CONTRACT_TEXT.edit}
                    </Button>
                  ) : null}
                </span>
              }
            >
              <div className="flex flex-wrap items-center gap-sm text-body-sm text-muted-foreground">
                <span>
                  {c.termStart && c.termEnd ? CONTRACT_TEXT.term(c.termStart, c.termEnd) : CONTRACT_TEXT.termOpen}
                </span>
                {c.phase === "in_force" && c.daysLeft !== null ? <Tag>{CONTRACT_TEXT.daysLeft(c.daysLeft)}</Tag> : null}
                {c.phase === "in_force" && c.noticeBy && c.noticeDays > 0 ? (
                  <Tag>{CONTRACT_TEXT.noticeBy(c.noticeBy)}</Tag>
                ) : null}
                {c.totalAmount !== null ? (
                  <span className="text-foreground tabular-nums">
                    {CONTRACT_TEXT.fieldAmount} {formatMoney(c.totalAmount, c.currency, locale)}
                  </span>
                ) : null}
                {/* 续约世系: the whole chain once it has one, not one hop each
                    way - "续自 HT-2" alone cannot say this is the third year. */}
                {c.lineage.chainNos.length > 1 ? (
                  <Tag>{CONTRACT_TEXT.lineage(c.lineage.position, c.lineage.chainNos.length, c.lineage.chainNos)}</Tag>
                ) : (
                  <>
                    {c.renewedFromNo ? <Tag>{CONTRACT_TEXT.renewedFrom(c.renewedFromNo)}</Tag> : null}
                    {c.renewedByNo ? <Tag>{CONTRACT_TEXT.renewedTo(c.renewedByNo)}</Tag> : null}
                  </>
                )}
              </div>

              {/* 续约记录 - append-only, so there is no edit or remove here. */}
              {c.events.length > 0 ? (
                <ul className="mt-xs flex flex-col gap-3xs text-body-sm text-muted-foreground">
                  {c.events.map((e) => (
                    <li key={e.id}>
                      <span className="tabular-nums">{e.occurredAt}</span> {eventText(e)}
                      {e.reason ? ` · ${e.reason}` : ""}
                      {e.actorName ? ` · ${e.actorName}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}

              {c.lines.length === 0 ? (
                <p className="mt-xs text-muted-foreground text-body-sm">{CONTRACT_TEXT.noLines}</p>
              ) : (
                <PanelList>
                  {c.lines.map((l) => (
                    <PanelItem
                      key={l.id}
                      main={
                        <span className="text-foreground text-body-sm">
                          {productName(l.productName)}{" "}
                          <span className="text-muted-foreground">
                            {CONTRACT_TEXT.qty(String(l.quantity))} · {formatMoney(l.unitPrice, l.currency, locale)}
                          </span>
                        </span>
                      }
                      trail={
                        <span className="flex items-center gap-xs">
                          {l.termEnd ? <Tag>{CONTRACT_TEXT.lineUntil(l.termEnd)}</Tag> : null}
                          <span className="text-foreground text-body-sm tabular-nums whitespace-nowrap">
                            {formatMoney(l.amount, l.currency, locale)}
                          </span>
                          {props.canWrite && c.status !== "terminated" ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setLineFor({ contract: c, line: l })}>
                                {CONTRACT_TEXT.edit}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRemoving({ contract: c, line: l })}>
                                {CONTRACT_TEXT.removeLine}
                              </Button>
                            </>
                          ) : null}
                        </span>
                      }
                    />
                  ))}
                </PanelList>
              )}

              <div className="mt-xs flex items-center justify-between">
                {c.lineTotal !== null && c.lines.length > 0 ? (
                  <span className="text-muted-foreground text-body-sm tabular-nums">
                    {CONTRACT_TEXT.lineTotal} {formatMoney(c.lineTotal, c.currency, locale)}
                  </span>
                ) : (
                  <span />
                )}
                {props.canWrite && c.status !== "terminated" ? (
                  <Button size="sm" variant="secondary" onClick={() => setLineFor({ contract: c, line: null })}>
                    {CONTRACT_TEXT.addLine}
                  </Button>
                ) : null}
              </div>
            </PanelCard>
          ))}
        </>
      )}

      <ContractDrawer
        target={editing}
        accountId={props.accountId}
        deals={props.deals}
        defaultCurrency={props.defaultCurrency}
        onClose={() => setEditing(null)}
        onSave={props.onSaveContract}
        onRenew={props.onRenew}
      />
      <OutcomeDrawer
        target={outcomeFor}
        accountId={props.accountId}
        onClose={() => setOutcomeFor(null)}
        onRecord={props.onRecordOutcome}
      />
      <LineDrawer
        target={lineFor}
        accountId={props.accountId}
        products={props.products}
        onClose={() => setLineFor(null)}
        onSave={props.onSaveLine}
      />
      {removing ? (
        <ConfirmDestructive
          open={!!removing}
          onOpenChange={(o) => {
            if (!o && !pending) setRemoving(null);
          }}
          verb={CONTRACT_TEXT.removeLine}
          target={productName(removing.line.productName)}
          consequence={CONTRACT_TEXT.removeConsequence}
          onConfirm={() => remove(removing)}
        />
      ) : null}
    </div>
  );
}

function ContractDrawer({
  target,
  accountId,
  deals,
  defaultCurrency,
  onClose,
  onSave,
  onRenew,
}: {
  readonly target: DrawerTarget | null;
  readonly accountId: string;
  readonly deals: ReadonlyArray<{ id: string; name: string }>;
  readonly defaultCurrency: string;
  readonly onClose: () => void;
  readonly onSave: ContractRosterProps["onSaveContract"];
  readonly onRenew: ContractRosterProps["onRenew"];
}) {
  const { CONTRACT_TEXT, CONTRACT_ERROR, DS_LABELS } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const held = target?.mode === "edit" ? target.row : null;
  const renewFrom = target?.mode === "renew" ? target.row : null;
  const [form, setForm] = useState(() => blank(defaultCurrency));

  useEffect(() => {
    if (!target) return;
    setForm(
      renewFrom
        ? successorOf(renewFrom)
        : held
        ? {
            contractNo: held.contractNo,
            name: held.name,
            opportunityId: held.opportunityId ?? "",
            status: held.status,
            totalAmount: held.totalAmount === null ? "" : String(held.totalAmount),
            currency: held.currency,
            termStart: held.termStart ?? "",
            termEnd: held.termEnd ?? "",
            noticeDays: String(held.noticeDays),
            signedAt: held.signedAt ?? "",
          }
        : blank(defaultCurrency),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () =>
    start(async () => {
      const fields = {
        accountId,
        contractNo: form.contractNo,
        name: form.name,
        opportunityId: form.opportunityId === "" ? null : form.opportunityId,
        status: form.status,
        totalAmount: form.totalAmount.trim() === "" ? null : Number(form.totalAmount),
        currency: form.currency,
        termStart: form.termStart || null,
        termEnd: form.termEnd || null,
        noticeDays: Number(form.noticeDays),
        signedAt: form.signedAt || null,
      };
      const r = renewFrom
        ? await onRenew({ ...fields, fromId: renewFrom.id })
        : await onSave({ ...fields, contractId: held?.id ?? null });
      if (!r.ok) {
        toast({ tone: "danger", title: CONTRACT_ERROR[r.error ?? "denied"] ?? CONTRACT_ERROR.denied });
        return;
      }
      toast({ tone: "success", title: CONTRACT_TEXT.saved });
      onClose();
    });

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      width="sm"
      title={renewFrom ? CONTRACT_TEXT.drawerRenew : held ? CONTRACT_TEXT.drawerEdit : CONTRACT_TEXT.drawerCreate}
      description={renewFrom ? CONTRACT_TEXT.renewHint(renewFrom.contractNo) : undefined}
      closeLabel={DS_LABELS.confirmCancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {DS_LABELS.confirmCancel}
          </Button>
          <Button disabled={pending} onClick={submit}>
            {CONTRACT_TEXT.save}
          </Button>
        </div>
      }
    >
      <div className="gap-lg flex flex-col">
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldNo}</FieldLabel>
          <Input value={form.contractNo} onChange={set("contractNo")} disabled={pending || held !== null} />
          {held ? <FieldDescription>{CONTRACT_TEXT.fieldNoFrozen}</FieldDescription> : null}
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldName}</FieldLabel>
          <Input value={form.name} onChange={set("name")} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldDeal}</FieldLabel>
          <NativeSelect value={form.opportunityId} onChange={set("opportunityId")} disabled={pending || held !== null}>
            <option value="">{CONTRACT_TEXT.fieldDealNone}</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
          {held ? <FieldDescription>{CONTRACT_TEXT.fieldDealFrozen}</FieldDescription> : null}
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldStatus}</FieldLabel>
          <NativeSelect value={form.status} onChange={set("status")} disabled={pending}>
            <option value="draft">{CONTRACT_TEXT.statusDraft}</option>
            <option value="active">{CONTRACT_TEXT.statusActive}</option>
            <option value="terminated">{CONTRACT_TEXT.statusTerminated}</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldAmount}</FieldLabel>
          <Input type="number" min="0" value={form.totalAmount} onChange={set("totalAmount")} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldCurrency}</FieldLabel>
          <Input value={form.currency} onChange={set("currency")} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldTermStart}</FieldLabel>
          <Input type="date" value={form.termStart} onChange={set("termStart")} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldTermEnd}</FieldLabel>
          <Input type="date" value={form.termEnd} onChange={set("termEnd")} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldNotice}</FieldLabel>
          <Input type="number" min="0" max="365" value={form.noticeDays} onChange={set("noticeDays")} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldSigned}</FieldLabel>
          <Input type="date" value={form.signedAt} onChange={set("signedAt")} disabled={pending} />
        </Field>
      </div>
    </Drawer>
  );
}

/**
 * The successor's starting point: same name, value, currency and notice; the
 * term starts the day after the old one ends and runs as long. A proposal the
 * person edits, not a guess the system commits - nothing is saved until Save.
 */
function successorOf(from: ContractRow) {
  const DAY = 86_400_000;
  const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
  let termStart = "";
  let termEnd = "";
  if (from.termEnd) {
    const end = Date.parse(`${from.termEnd}T00:00:00Z`);
    termStart = ymd(end + DAY);
    if (from.termStart) {
      const length = end - Date.parse(`${from.termStart}T00:00:00Z`);
      termEnd = ymd(end + DAY + length);
    }
  }
  return {
    contractNo: "",
    name: from.name,
    opportunityId: "",
    status: "active",
    totalAmount: from.totalAmount === null ? "" : String(from.totalAmount),
    currency: from.currency,
    termStart,
    termEnd,
    noticeDays: String(from.noticeDays),
    signedAt: "",
  };
}

function OutcomeDrawer({
  target,
  accountId,
  onClose,
  onRecord,
}: {
  readonly target: ContractRow | null;
  readonly accountId: string;
  readonly onClose: () => void;
  readonly onRecord: ContractRosterProps["onRecordOutcome"];
}) {
  const { CONTRACT_TEXT, CONTRACT_ERROR, DS_LABELS } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [eventType, setEventType] = useState("lost");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!target) return;
    setEventType("lost");
    setReason("");
  }, [target]);

  const submit = () =>
    start(async () => {
      if (!target) return;
      const r = await onRecord({ accountId, contractId: target.id, eventType, reason });
      if (!r.ok) {
        toast({ tone: "danger", title: CONTRACT_ERROR[r.error ?? "denied"] ?? CONTRACT_ERROR.denied });
        return;
      }
      toast({ tone: "success", title: CONTRACT_TEXT.saved });
      onClose();
    });

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      width="sm"
      title={CONTRACT_TEXT.drawerOutcome}
      description={target ? `${target.name} · ${target.contractNo}` : undefined}
      closeLabel={DS_LABELS.confirmCancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {DS_LABELS.confirmCancel}
          </Button>
          <Button disabled={pending || reason.trim() === ""} onClick={submit}>
            {CONTRACT_TEXT.save}
          </Button>
        </div>
      }
    >
      <div className="gap-lg flex flex-col">
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldOutcome}</FieldLabel>
          <NativeSelect value={eventType} onChange={(e) => setEventType(e.target.value)} disabled={pending}>
            <option value="lost">{CONTRACT_TEXT.outcomeLost}</option>
            <option value="downgraded">{CONTRACT_TEXT.outcomeDowngraded}</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldReason}</FieldLabel>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} maxLength={255} />
          <FieldDescription>{CONTRACT_TEXT.outcomeAppendOnly}</FieldDescription>
        </Field>
      </div>
    </Drawer>
  );
}

function blank(currency: string) {
  return {
    contractNo: "",
    name: "",
    opportunityId: "",
    status: "draft",
    totalAmount: "",
    currency,
    termStart: "",
    termEnd: "",
    noticeDays: "30",
    signedAt: "",
  };
}

function LineDrawer({
  target,
  accountId,
  products,
  onClose,
  onSave,
}: {
  readonly target: { contract: ContractRow; line: ContractLineRow | null } | null;
  readonly accountId: string;
  readonly products: ReadonlyArray<{ id: string; name: string }>;
  readonly onClose: () => void;
  readonly onSave: ContractRosterProps["onSaveLine"];
}) {
  const { CONTRACT_TEXT, CONTRACT_ERROR, DS_LABELS } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const line = target?.line ?? null;

  useEffect(() => {
    if (!target) return;
    setProductId(line?.productId ?? products[0]?.id ?? "");
    setQuantity(line ? String(line.quantity) : "1");
    setUnitPrice(line ? String(line.unitPrice) : "");
    setTermEnd(line?.termEnd ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = () =>
    start(async () => {
      if (!target) return;
      const r = await onSave({
        accountId,
        contractId: target.contract.id,
        lineId: line?.id ?? null,
        productId,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        termEnd: termEnd || null,
      });
      if (!r.ok) {
        toast({ tone: "danger", title: CONTRACT_ERROR[r.error ?? "denied"] ?? CONTRACT_ERROR.denied });
        return;
      }
      toast({ tone: "success", title: CONTRACT_TEXT.saved });
      onClose();
    });

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      width="sm"
      title={CONTRACT_TEXT.drawerLine}
      description={target ? `${target.contract.name} · ${target.contract.contractNo}` : undefined}
      closeLabel={DS_LABELS.confirmCancel}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {DS_LABELS.confirmCancel}
          </Button>
          <Button disabled={pending || productId === "" || unitPrice.trim() === ""} onClick={submit}>
            {CONTRACT_TEXT.save}
          </Button>
        </div>
      }
    >
      <div className="gap-lg flex flex-col">
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldProduct}</FieldLabel>
          <NativeSelect value={productId} onChange={(e) => setProductId(e.target.value)} disabled={pending || line !== null}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldQty}</FieldLabel>
          <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldUnitPrice}</FieldLabel>
          <Input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>{CONTRACT_TEXT.fieldLineEnd}</FieldLabel>
          <Input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} disabled={pending} />
        </Field>
      </div>
    </Drawer>
  );
}
