import { getMessages } from "../lib/i18n/server";
import { stageLabelFor } from "../lib/view-model";
import type { StageDefinition } from "../../domains/pipeline/lib/stage";
import type { ClaimEventRecord } from "../../domains/pipeline/lib/claims";

// 推进进程 · 变更史 (YC-069 §06, deal batch 3): the claim log (incr/0084) and
// the stage journal MERGED, newest first - close date, amount, category, win
// rate and stage, each change with its reason and where it came from. Two
// journals of one deal read side by side are one history; the old stage
// journey panel and this are the same question.

export interface StageMove {
  readonly id: string;
  readonly fromStage: string | null;
  readonly toStage: string;
  readonly reason: string | null;
  readonly actorSub: string | null;
  readonly occurredAt: Date;
  /** The stage left, as checked when it was left (incr/0088); null = not recorded. */
  readonly exitCheck?: { readonly met: readonly string[]; readonly unmet: readonly string[]; readonly unknown: readonly string[] } | null;
}

export async function ChangeHistory({
  claims,
  stages,
  stageDefinitions,
  actorNames,
  categoryLabel,
}: {
  readonly claims: readonly ClaimEventRecord[];
  readonly stages: readonly StageMove[];
  readonly stageDefinitions: readonly StageDefinition[];
  readonly actorNames: Readonly<Record<string, string>>;
  readonly categoryLabel: Readonly<Record<string, string>>;
}) {
  const { DEAL_PAGE_TEXT, STAGE_LABEL } = await getMessages();
  const stageName = (s: string) => stageLabelFor(s, stageDefinitions, STAGE_LABEL);
  const who = (sub: string | null) => (sub ? (actorNames[sub] ?? sub) : DEAL_PAGE_TEXT.historySystem);
  const value = (field: string, v: string | null) =>
    v === null ? DEAL_PAGE_TEXT.claimNone : field === "forecast_category" ? (categoryLabel[v] ?? v) : field === "probability" ? `${v}%` : v;

  const rows = [
    ...claims.map((c) => ({
      id: c.id,
      at: c.occurredAt,
      text: DEAL_PAGE_TEXT.claimChange(
        DEAL_PAGE_TEXT.claimField[c.field] ?? c.field,
        value(c.field, c.fromValue),
        value(c.field, c.toValue),
      ),
      reason: c.reason,
      by: DEAL_PAGE_TEXT.historyBy(who(c.actorSub), DEAL_PAGE_TEXT.claimSource[c.source] ?? c.source),
      stage: false,
      exit: null as StageMove["exitCheck"],
    })),
    ...stages.map((e) => ({
      id: e.id,
      at: e.occurredAt,
      text: DEAL_PAGE_TEXT.stageChange(e.fromStage ? stageName(e.fromStage) : null, stageName(e.toStage)),
      reason: e.reason,
      by: who(e.actorSub),
      stage: true,
      exit: e.exitCheck ?? null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // Folded by default (YC-072 .hist): the history is looked up, not read
  // every visit. MM-DD in the row, the full date on hover.
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[11.5px] font-bold">
        {DEAL_PAGE_TEXT.historyFold(rows.length)}
      </summary>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-xs text-body-sm">{DEAL_PAGE_TEXT.historyEmpty}</p>
      ) : (
        <ol className="mt-2xs flex flex-col">
          {rows.map((r) => (
            <li
              key={r.id}
              className="border-border grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-sm border-b border-dashed py-xs text-[12px] last:border-b-0"
            >
              <time
                className="text-muted-foreground font-mono tabular-nums"
                dateTime={r.at.toISOString()}
                title={r.at.toISOString().slice(0, 10)}
              >
                {r.at.toISOString().slice(5, 10)}
              </time>
              <span className="min-w-0">
                {r.text}
                {r.reason ? <span className="text-muted-foreground"> · {DEAL_PAGE_TEXT.historyReason(r.reason)}</span> : null}
                {r.exit ? (
                  <span
                    className={r.exit.unmet.length > 0 ? "text-(color:--warning-text)" : "text-muted-foreground"}
                    title={r.exit.unmet.length > 0 ? DEAL_PAGE_TEXT.historyExitUnmet(r.exit.unmet) : undefined}
                  >
                    {" · "}
                    {DEAL_PAGE_TEXT.historyExit(r.exit.met.length, r.exit.met.length + r.exit.unmet.length + r.exit.unknown.length)}
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground text-[11px] whitespace-nowrap">{r.by}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-muted-foreground mt-xs text-[11px]">{DEAL_PAGE_TEXT.historySince}</p>
    </details>
  );
}
