import type { ReactNode } from "react";
import { ROW_EDGE, ROW_TEXT, TONED_ROW, type RowTone } from "./deal-tone";
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

const EDGE: Record<BriefCell["tone"], RowTone> = { good: "good", warn: "warn", bad: "bad" };

export async function WarRoom({
  cells,
  actionsLabel,
  children,
}: {
  readonly cells: readonly BriefCell[];
  /** The heading over the action cards (待动手的事), from the host panel. */
  readonly actionsLabel?: ReactNode;
  /** The action cards, worst-first - each its own client island. */
  readonly children?: ReactNode;
}) {
  const { WAR_ROOM_TEXT } = await getMessages();
  return (
    <div className="flex flex-col">
      {/* One cell per dimension. minmax(0,1fr) so a long headline wraps inside
          its cell instead of pushing the strip sideways. */}
      {/* As many columns as cells - four on a closed deal, not four and a hole. */}
      <div className={`grid gap-xs sm:grid-cols-2 ${cells.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
        {cells.map((c) => (
          // YC-072 .cell: a flat, edge-toned cell - what it reads, then the
          // verdict in the tone's colour. Its height is its text.
          <div key={c.key} className={`min-w-0 ${TONED_ROW} border-border border ${ROW_EDGE[EDGE[c.tone]]}`}>
            <p className="text-muted-foreground text-[11px]">{WAR_ROOM_TEXT.cell[c.key]}</p>
            <p className={`mt-3xs text-[12.5px] font-bold ${c.tone === "good" ? "text-foreground" : ROW_TEXT[EDGE[c.tone]]}`}>
              {c.headline}
            </p>
            {c.detail ? <p className="text-muted-foreground mt-3xs text-[11px]">{c.detail}</p> : null}
          </div>
        ))}
      </div>
      {children ? (
        <div className="mt-md flex flex-col gap-xs">
          {actionsLabel}
          {children}
        </div>
      ) : null}
    </div>
  );
}
