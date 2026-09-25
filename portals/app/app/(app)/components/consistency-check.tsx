"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Icon, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import type { ConsistencyResult } from "../account/[id]/consistency-action";

// 核对说法 (L2 batch 7b). Four states, four sentences (design 04):
//   never checked / checked, nothing found / N suspected conflicts / check failed.
// "Not checked" and "checked and clean" must never read alike - the first is
// ignorance, the second is a finding.
//
// Each suspected conflict shows both quotes and carries the 模型推断 mark, so
// it cannot be mistaken for the rule-computed 陈旧 mark (batch 7a). Deciding it
// happens in the queue, like every proposal (ADR-003) - this only points there.

export interface PendingConflict {
  readonly id: string;
  readonly topic: string;
  readonly a: { readonly date: string | null; readonly quote: string };
  readonly b: { readonly date: string | null; readonly quote: string };
}

export function ConsistencyCheck({
  accountId,
  lastChecked,
  pending,
  onCheck,
}: {
  readonly accountId: string;
  /** yyyy-mm-dd of this member's last check on this account, or null. */
  readonly lastChecked: string | null;
  readonly pending: readonly PendingConflict[];
  readonly onCheck: (accountId: string) => Promise<ConsistencyResult>;
}) {
  const { CONSISTENCY_TEXT, CONSISTENCY_ERROR } = useMessages();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setFailed(null);
      const r = await onCheck(accountId);
      if (!r.ok) {
        setFailed(CONSISTENCY_ERROR[r.error] ?? CONSISTENCY_ERROR.unknown);
        return;
      }
      toast({
        tone: r.conflicts > 0 ? "warning" : "success",
        title:
          r.checkedNotes < 2
            ? CONSISTENCY_TEXT.tooFew
            : r.unchanged
              ? CONSISTENCY_TEXT.unchanged(r.conflicts)
              : r.conflicts > 0
              ? CONSISTENCY_TEXT.found(r.conflicts)
              : CONSISTENCY_TEXT.clean(r.checkedNotes),
      });
    });

  const status = failed
    ? failed
    : pending.length > 0
      ? CONSISTENCY_TEXT.pending(pending.length)
      : lastChecked
        ? CONSISTENCY_TEXT.checkedOn(lastChecked)
        : CONSISTENCY_TEXT.never;

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-xs">
        <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
          <Icon name="search" size="xs" />
          {busy ? CONSISTENCY_TEXT.checking : CONSISTENCY_TEXT.button}
        </Button>
        <span className={failed ? "text-destructive-text text-body-sm" : "text-muted-foreground text-body-sm"}>
          {status}
        </span>
      </div>
      {pending.map((c) => (
        <div key={c.id} className="border-border flex flex-col gap-3xs rounded-md border p-xs text-body-sm">
          <span className="flex flex-wrap items-center gap-xs">
            <span title={CONSISTENCY_TEXT.modelHint}>
              <Tag tone="info">{CONSISTENCY_TEXT.modelMark}</Tag>
            </span>
            <span className="font-bold">{c.topic}</span>
          </span>
          {[c.a, c.b].map((side, i) => (
            <span key={i}>
              <span className="text-muted-foreground tabular-nums">{side.date ?? ""}</span> {CONSISTENCY_TEXT.quote(side.quote)}
            </span>
          ))}
          <Link href="/copilot" className="text-body-sm underline">
            {CONSISTENCY_TEXT.decide}
          </Link>
        </div>
      ))}
    </div>
  );
}
