"use client";

import { useState, useTransition } from "react";
import {
  Button,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  Section,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import {
  COMMITMENT_DIRECTIONS,
  isOverdue,
} from "../../domains/account/lib/commitment";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CapBadge } from "./panorama-annotations";

// Promises, and the one control that makes them worth recording.
//
// "Mark met" is DISABLED until a follow-up is chosen to prove it. That is not a
// UI nicety - the rule refuses it and so does the database CHECK - but showing
// it as a blocked control with the reason attached is what teaches the
// distinction. A next step its owner can tick off is a to-do list, and a to-do
// list has never diagnosed a stalled deal.
//
// "Mark missed" needs nothing, and that asymmetry is the point: success must be
// evidenced, failure is what happens when nothing does.

export interface CommitmentItem {
  readonly id: string;
  readonly direction: string;
  readonly statement: string;
  readonly dueAt: Date;
  readonly status: string;
  readonly ownerSub: string | null;
}

export interface EvidenceOption {
  readonly id: string;
  readonly label: string;
}

export interface CommitmentListProps {
  readonly accountId: string;
  /** Set when the list is scoped to one deal: promises made in a deal belong to
   * that deal's page, and closing one there must refresh it. */
  readonly opportunityId?: string;
  readonly items: readonly CommitmentItem[];
  /** Interactions that can close one. Empty means nothing can be marked met. */
  readonly evidence: readonly EvidenceOption[];
  readonly canWrite: boolean;
  readonly now?: Date;
  /**
   * Where a NEW promise gets recorded - the capture page, with this list's
   * context in the URL. The create form left this component on 2026-09-05
   * (the consolidation ruling): it lived twice, on two pages, severed from
   * the conversation the promise came out of, and origin_interaction_id was
   * never once set through it. Recording happens where the interaction does.
   */
  readonly captureHref: string;
  readonly onSettle: (
    accountId: string,
    id: string,
    input: {
      to: string;
      evidenceInteractionId?: string;
      waiveReason?: string;
      opportunityId?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  /** 默认 false, 不改 pipeline 详情页的样子 (owner, 2026-09-20: 去掉所有
   *  垃圾说明 - 账户详情页传 true, 见 org-unit-panel.tsx 同名注释). */
  readonly hideDescription?: boolean;
  /** 默认 false, 不改 pipeline 详情页的样子 - 那边这张卡是独立一张, 标题
   *  就是唯一的标题。账户详情页传 true (owner, 2026-09-21: 继续梳理阵地
   *  清单) - 那边这张卡挂在"承诺 (N)"这个 tab 里面, tab 本身已经说过一次
   *  "承诺", 卡自己的标题再说一遍是重复。 */
  readonly hideTitle?: boolean;
}

const DAY = 86_400_000;

export function CommitmentList({
  accountId,
  opportunityId,
  items,
  evidence,
  canWrite,
  now,
  captureHref,
  onSettle,
  hideDescription,
  hideTitle,
}: CommitmentListProps) {
  const { COMMIT_STATUS_LABEL, DIRECTION_LABEL, FIELD_ERROR, FIELD_TEXT } =
    useMessages();
  const at = now ?? new Date();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  // ONE ROW'S CLOSING FORM AT A TIME (polish, 2026-09-24, from clicking
  // through the tab): every open commitment used to show its evidence picker,
  // three buttons and a reason box at once - three commitments were a wall of
  // form. A row is its statement and its due date until someone asks to 处理.
  const [handling, setHandling] = useState<string | null>(null);

  function run(op: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(() => {
      void op().then((r) => {
        if (!r.ok)
          setError(FIELD_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
      });
    });
  }

  const open = items.filter((c) => c.status === "open");
  const settled = items.filter((c) => c.status !== "open");

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释).
  return (
    <Section
      tone="raised"
      style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
      title={hideTitle ? undefined : FIELD_TEXT.commitTitle}
      description={hideDescription ? undefined : FIELD_TEXT.commitDescription}
    >
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {items.length === 0 ? (
        <EmptyState
          title={FIELD_TEXT.commitEmpty}
          description={FIELD_TEXT.commitEmptyDescription}
        />
      ) : null}

      {open.map((c) => {
        const overdue = isOverdue({ status: "open", dueAt: c.dueAt }, at);
        const days = Math.floor(
          Math.abs(at.getTime() - c.dueAt.getTime()) / DAY,
        );
        const chosen = picked[c.id] ?? "";
        return (
          <div key={c.id} className="border-border flex flex-col gap-xs border-b py-xs last:border-b-0">
            <div className="flex items-center gap-xs">
              <PartyBadge direction={c.direction} text={FIELD_TEXT} />
              <span className="text-foreground min-w-0 flex-1 truncate text-body-sm" title={c.statement}>{c.statement}</span>
              <Tag tone={overdue ? "danger" : "neutral"} dot={overdue}>
                {overdue
                  ? FIELD_TEXT.commitDaysOverdue(days)
                  : FIELD_TEXT.commitDueIn(days)}
              </Tag>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={handling === c.id}
                  onClick={() => setHandling(handling === c.id ? null : c.id)}
                >
                  {handling === c.id ? FIELD_TEXT.commitHandleClose : FIELD_TEXT.commitHandle}
                </Button>
              ) : null}
            </div>

            {canWrite && handling === c.id ? (
              <div className="bg-muted/40 border-border flex flex-col gap-xs rounded-md border p-sm">
                {/* Closing needs proof. The picker IS the requirement. */}
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="min-w-[12rem] flex-1">
                    <NativeSelect
                      aria-label={FIELD_TEXT.commitCloseNeedsEvidence}
                      value={chosen}
                      onChange={(e) =>
                        setPicked({ ...picked, [c.id]: e.target.value })
                      }
                      disabled={pending || evidence.length === 0}
                    >
                      <option value="">
                        {FIELD_TEXT.commitCloseNeedsEvidence}
                      </option>
                      {evidence.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </span>
                  <Button
                    size="sm"
                    disabled={pending || chosen === ""}
                    onClick={() =>
                      run(() =>
                        onSettle(accountId, c.id, {
                          to: "met",
                          evidenceInteractionId: chosen,
                          opportunityId,
                        }),
                      )
                    }
                  >
                    {FIELD_TEXT.commitClose}
                  </Button>
                  {/* Needs nothing, and is only offered once it is actually late. */}
                  {overdue ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          onSettle(accountId, c.id, {
                            to: "missed",
                            opportunityId,
                          }),
                        )
                      }
                    >
                      {FIELD_TEXT.commitMissed}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="min-w-[12rem] flex-1">
                    <Input
                      aria-label={FIELD_TEXT.commitWaiveReason}
                      placeholder={FIELD_TEXT.commitWaiveReason}
                      value={reason[c.id] ?? ""}
                      onChange={(e) =>
                        setReason({ ...reason, [c.id]: e.target.value })
                      }
                      disabled={pending}
                    />
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || !(reason[c.id] ?? "").trim()}
                    onClick={() =>
                      run(() =>
                        onSettle(accountId, c.id, {
                          to: "waived",
                          waiveReason: reason[c.id],
                          opportunityId,
                        }),
                      )
                    }
                  >
                    {FIELD_TEXT.commitWaive}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {settled.map((c) => (
        <div key={c.id} className="border-border flex items-center gap-xs border-b py-xs last:border-b-0">
          <PartyBadge direction={c.direction} text={FIELD_TEXT} />
          <span className="text-foreground min-w-0 flex-1 truncate text-body-sm">{c.statement}</span>
          <Tag
            tone={
              c.status === "met"
                ? "success"
                : c.status === "missed"
                  ? "danger"
                  : "neutral"
            }
          >
            {COMMIT_STATUS_LABEL[c.status] ?? c.status}
          </Tag>
        </div>
      ))}

      <ComplianceStats items={items} text={FIELD_TEXT} />

      {canWrite ? (
        <div className="mt-sm">
          <Button asChild size="sm" variant="secondary">
            <a href={captureHref}>{FIELD_TEXT.commitCreate}</a>
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

function PartyBadge({
  direction,
  text,
}: {
  readonly direction: string;
  readonly text: { commitPartyTheirs: string; commitPartyOurs: string };
}) {
  const isTheirs = direction === "they_owe";
  return (
    <span
      className="text-label-sm inline-flex flex-none items-center whitespace-nowrap rounded px-sm py-3xs font-bold"
      style={{
        background: isTheirs ? "var(--muted)" : "var(--accent)",
        color: isTheirs ? "var(--muted-foreground)" : "var(--primary)",
      }}
    >
      {isTheirs ? text.commitPartyTheirs : text.commitPartyOurs}
    </span>
  );
}

function ComplianceStats({
  items,
  text,
}: {
  readonly items: readonly CommitmentItem[];
  readonly text: {
    commitComplianceRate: string;
    commitPartyTheirs: string;
    commitPartyOurs: string;
  };
}) {
  if (items.length === 0) return null;

  const theyMet = items.filter(
    (c) => c.direction === "they_owe" && c.status === "met",
  ).length;
  const theyTotal = items.filter(
    (c) => c.direction === "they_owe" && c.status !== "open",
  ).length;
  const weMet = items.filter(
    (c) => c.direction === "we_owe" && c.status === "met",
  ).length;
  const weTotal = items.filter(
    (c) => c.direction === "we_owe" && c.status !== "open",
  ).length;

  if (theyTotal === 0 && weTotal === 0) return null;

  return (
    <div className="border-border text-muted-foreground flex flex-wrap items-center gap-lg border-t pt-sm text-body-sm">
      {theyTotal > 0 ? (
        <span>
          {text.commitComplianceRate}
          {": "}
          <span className="text-foreground font-mono font-bold">
            {theyMet}/{theyTotal}
          </span>
          {` (${text.commitPartyTheirs})`}
        </span>
      ) : null}
      {weTotal > 0 ? (
        <span>
          {text.commitComplianceRate}
          {": "}
          <span className="text-foreground font-mono font-bold">
            {weMet}/{weTotal}
          </span>
          {` (${text.commitPartyOurs})`}
        </span>
      ) : null}
      <CapBadge tier="pro">Pro</CapBadge>
    </div>
  );
}
