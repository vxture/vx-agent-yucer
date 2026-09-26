import type { ReactNode } from "react";
import { FactorCards, type FactorTone } from "./factor-cards";
import type { BriefCell } from "../../domains/pipeline/lib/brief";
import { getMessages } from "../lib/i18n/server";

// The war room's shell: the verdict strip, and the slot the action cards
// render into - owner ruling 2026-09-05 (判决 → 建议 → 动作).
//
// NO FRAME OF ITS OWN since deal batch 2: it is the body of the 态势判决
// panel, which carries the title, the fold and the findings line. The five
// cells are replaced by the five-dimension cards in batch 8.
//
// A SERVER COMPONENT, deliberately. It binds no actions and holds no state;
// every card below it is its own client island with its own server action and
// its own error dictionary, which is what reachable-codes.test.ts pairs at
// file granularity. The shell composing them is display only.
//
// THE STRIP IS THE RULES' VERDICT and nothing else. Five dimensions, each
// computed by a rule that predates this page (stall, category, chain, promise,
// floor), each carrying its evidence. Proposals - the machine's findings - are
// deliberately NOT a sixth cell: they join the action list below, where a
// person can adjudicate them, because the strip states what IS and the cards
// offer what to DO.

const TONE: Record<BriefCell["tone"], FactorTone> = { good: "good", warn: "mild", bad: "severe" };

export async function WarRoom({
  cells,
  points,
  actionsLabel,
  children,
}: {
  readonly cells: readonly BriefCell[];
  /** Each dimension's own 0-100 in 商机评估分 (incr/0091) - every card out
   *  of 100 (owner 2026-09-25: 这几项满分不是100分); the weights only
   *  combine them into the dossier's score. */
  readonly points?: Partial<Record<BriefCell["key"], number>>;
  /** The heading over the action cards (待动手的事), from the host panel. */
  readonly actionsLabel?: ReactNode;
  /** The action cards, worst-first - each its own client island. */
  readonly children?: ReactNode;
}) {
  const { WAR_ROOM_TEXT } = await getMessages();
  return (
    <div className="flex flex-col">
      {/* 评估卡 (owner 2026-09-25: 按照card方式，参考客户详情页): the
          customer page's 客户评估 card, figure | (name / note). The figure is
          this deal's 0-100 on the dimension in 商机评估分, so the five read
          as one deal's numbers; the note is the
          verdict's one line, the evidence on hover. */}
      <FactorCards
        items={cells.map((c) => {
          const p = points?.[c.key];
          return {
            id: c.key,
            label: WAR_ROOM_TEXT.cell[c.key] ?? c.key,
            note: c.detail ? `${c.headline} · ${c.detail}` : c.headline,
            value: p !== undefined ? String(p) : WAR_ROOM_TEXT.toneWord[c.tone] ?? "",
            tone: TONE[c.tone],
          };
        })}
      />
      {children ? (
        <div className="mt-md flex flex-col gap-xs">
          {actionsLabel}
          {children}
        </div>
      ) : null}
    </div>
  );
}
