"use client";

import { useState } from "react";
import { Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { StaleMark } from "./stale-mark";
import { CitationList } from "./citation-list";
import type { Judgement } from "./judgement-note";
import {
  findingSource,
  type FindingSource,
  type LaneJudgement,
  type RiskLevel,
  type RiskTypeResult,
} from "../../domains/account/lib/risk-types";

// 风险分型 (YC-021 L5): the five risk types side by side, each with what it
// rests on and who to go to. Inside the assessment card, under the factors -
// the same facts regrouped by who can act on them, not a new card.
//
// THE RULES ENGINE'S JUDGEMENTS LIVE HERE TOO (owner, 2026-09-24: 合并进风险
// 分型). Each joined the lane it is about (mergeJudgements); its line opens in
// place to the trigger condition and the cited rows. The title says which
// lanes carry something due today.

export type LaneRisk = RiskTypeResult & { readonly judgements: readonly (Judgement & LaneJudgement)[] };

const LEVEL_TONE: Record<RiskLevel, "danger" | "warning" | "success" | "neutral"> = {
  risk: "danger",
  watch: "warning",
  clear: "success",
  unknown: "neutral",
};

// The row's left edge carries the level (owner, 2026-09-24: 只带左边线的轻量
// 表格, 信息展开, 松散布局) - the tag says it in words, the edge lets the eye
// run down five rows and see where the trouble is.
const LEVEL_EDGE: Record<RiskLevel, string> = {
  risk: "border-s-destructive-border",
  watch: "border-s-warning-border",
  clear: "border-s-success-border",
  unknown: "border-s-border",
};

// 来源作为开头标签 (owner, 2026-09-24: 规则判断 | 智能分析 | 人工填报). A fixed
// width so the text after it starts on one line down the lane.
function SourceTag({ source }: { readonly source: FindingSource }) {
  const { RISK_TEXT } = useMessages();
  return (
    <span className="inline-flex w-[4.75rem] shrink-0" title={RISK_TEXT.sourceHint[source]}>
      <Tag tone={source === "model" ? "info" : "neutral"}>{RISK_TEXT.source[source]}</Tag>
    </span>
  );
}

function JudgementLine({ judgement }: { readonly judgement: Judgement & LaneJudgement }) {
  const { RISK_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const citations = judgement.citations ?? [];
  const canOpen = Boolean(judgement.rule) || citations.length > 0;
  return (
    <span className="flex flex-col">
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={canOpen ? RISK_TEXT.showEvidence : undefined}
        className="flex w-full items-center gap-sm text-left disabled:cursor-default"
      >
        <SourceTag source={judgement.source} />
        <span className={`text-foreground min-w-0 flex-1 font-medium ${open ? "" : "truncate"}`}>{judgement.claim}</span>
        {judgement.freshness?.stale ? (
          <span className="shrink-0">
            <StaleMark freshness={judgement.freshness} />
          </span>
        ) : null}
        {canOpen ? (
          <Icon name={open ? "chevron-down" : "chevron-right"} size="sm" className="text-muted-foreground shrink-0" />
        ) : null}
      </button>
      {open && judgement.rule ? <span className="mt-xs ps-[5.5rem]">{judgement.rule}</span> : null}
      {open && citations.length > 0 ? (
        <span className="mt-sm block ps-[5.5rem]">
          <CitationList citations={citations} />
        </span>
      ) : null}
    </span>
  );
}

export function RiskTypes({ risks }: { readonly risks: readonly LaneRisk[] }) {
  const { RISK_TEXT, healthReasonText } = useMessages();
  const dueToday = risks.filter((r) => r.judgements.some((j) => j.urgency === "today"));
  return (
    <div className="flex flex-col gap-xs">
      <span className="flex items-center gap-sm">
        <span className="text-muted-foreground text-label-sm font-bold">{RISK_TEXT.title}</span>
        {dueToday.length > 0 ? (
          <Tag tone="danger">{RISK_TEXT.today(dueToday.map((r) => RISK_TEXT.type[r.type]).join(RISK_TEXT.lanesJoin))}</Tag>
        ) : null}
      </span>
      {/* SPREAD ACROSS THE WIDTH (owner, 2026-09-24: 现在堆积在左侧, 右侧全部
          空的). Three columns per row - what and how bad | what it rests on,
          one line per finding, each opened by its source | who to go to,
          right-aligned. Judgements first: they carry evidence. */}
      {risks.map((r) => {
        const acting = r.level === "risk" || r.level === "watch";
        const empty = r.findings.length === 0 && r.judgements.length === 0;
        return (
          <div
            key={r.type}
            className={`grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-start gap-x-lg rounded-e-md border-s-[3px] bg-muted/30 px-md py-sm text-body-sm ${LEVEL_EDGE[r.level]}`}
          >
            <span className="flex items-center gap-sm">
              <span className="font-bold">{RISK_TEXT.type[r.type]}</span>
              <Tag tone={LEVEL_TONE[r.level]}>{RISK_TEXT.level[r.level]}</Tag>
            </span>
            <span className="text-muted-foreground flex min-w-0 flex-col gap-xs">
              {empty ? <span>{RISK_TEXT.noFinding(r.level)}</span> : null}
              {r.judgements.map((j) => (
                <JudgementLine key={j.id} judgement={j} />
              ))}
              {r.findings.map((f, i) => (
                <span key={i} className="flex items-center gap-sm">
                  <SourceTag source={findingSource(f)} />
                  <span className="min-w-0">{f.code === "renewal" ? healthReasonText(f.reason) : RISK_TEXT.finding(f)}</span>
                </span>
              ))}
            </span>
            <span className="flex flex-col items-end text-right whitespace-nowrap">
              {acting ? (
                <>
                  <span className="text-foreground font-bold">{r.who.name ?? RISK_TEXT.whoUnassigned}</span>
                  <span className="text-muted-foreground text-label-sm">{RISK_TEXT.role[r.who.role]}</span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
