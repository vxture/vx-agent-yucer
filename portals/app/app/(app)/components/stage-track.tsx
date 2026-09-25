import { getMessages } from "../lib/i18n/server";
import type { StageDefinition } from "../../domains/pipeline/lib/stage";
import type { StageMove } from "./change-history";

// 推进进程 · 阶段轨 (YC-072 prototype .track): the workspace's open stages in
// order, a bar each - filled for the stages behind, gradient for the current
// one - and under each what the journal kept when it was left (incr/0088):
// "离开时 2/3", "有理由" when it was moved past unmet criteria, "未记录" when
// the move predates the snapshot. The current stage shows today's check.

export async function StageTrack({
  stage,
  open,
  stageDefinitions,
  moves,
  current,
}: {
  readonly stage: string;
  readonly open: boolean;
  readonly stageDefinitions: readonly StageDefinition[];
  readonly moves: readonly StageMove[];
  readonly current: { readonly met: number; readonly total: number } | null;
}) {
  const { DEAL_PAGE_TEXT } = await getMessages();
  const stages = [...stageDefinitions].filter((s) => !s.isTerminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const here = stages.findIndex((s) => s.code === stage);
  return (
    <ol className="grid gap-2xs" style={{ gridTemplateColumns: `repeat(${Math.max(1, stages.length)}, minmax(0, 1fr))` }}>
      {stages.map((s, i) => {
        const state = !open || (here >= 0 && i < here) ? "done" : i === here ? "cur" : "todo";
        // The latest time the deal LEFT this stage.
        const left = moves
          .filter((m) => m.fromStage === s.code)
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
        const note =
          state === "cur"
            ? current && current.total > 0
              ? DEAL_PAGE_TEXT.trackCurrent(current.met, current.total)
              : DEAL_PAGE_TEXT.trackHere
            : state === "done"
              ? left?.exitCheck
                ? [
                    DEAL_PAGE_TEXT.historyExit(
                      left.exitCheck.met.length,
                      left.exitCheck.met.length + left.exitCheck.unmet.length + left.exitCheck.unknown.length,
                    ),
                    ...(left.exitCheck.unmet.length > 0 && left.reason ? [DEAL_PAGE_TEXT.trackWithReason] : []),
                  ].join(" · ")
                : DEAL_PAGE_TEXT.trackUnrecorded
              : "";
        return (
          <li key={s.code} className="flex min-w-0 flex-col gap-3xs" aria-current={state === "cur" ? "step" : undefined}>
            <span
              className={`h-[5px] rounded-full ${
                state === "done" ? "bg-primary" : state === "cur" ? "from-primary to-primary/30 bg-gradient-to-r" : "bg-muted"
              }`}
            />
            <span
              className={`truncate text-[11.5px] font-semibold ${state === "cur" ? "text-primary" : "text-muted-foreground"}`}
            >
              {s.name}
            </span>
            {note ? <span className="text-muted-foreground truncate text-[10.5px]">{note}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
