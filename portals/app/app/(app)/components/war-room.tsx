import type { ReactNode } from "react";
import { FactorCards, type FactorCardItem } from "./factor-cards";

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


export async function WarRoom({
  cards,
  actionsLabel,
  children,
}: {
  /** 商机评估's five cards, built by the page from the deal's facts. */
  readonly cards: readonly FactorCardItem[];
  /** The heading over the action cards (待动手的事), from the host panel. */
  readonly actionsLabel?: ReactNode;
  /** The action cards, worst-first - each its own client island. */
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {/* 商机评估 (owner 2026-09-25/26): five dimensions as the customer
          page's evaluation cards - each this deal's 0-100 and the one piece
          of work that closes its gap. The same five weigh the dossier's
          score and are set in /admin. */}
      <FactorCards items={cards} />
      {children ? (
        <div className="mt-md flex flex-col gap-xs">
          {actionsLabel}
          {children}
        </div>
      ) : null}
    </div>
  );
}
