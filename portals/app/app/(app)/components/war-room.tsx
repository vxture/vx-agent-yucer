import type { ReactNode } from "react";
import { Card, Section } from "@vxture/design-ui";
import type { BriefCell } from "../../domains/pipeline/lib/brief";
import { getMessages } from "../lib/i18n/server";

// The war room's shell: the verdict strip, and the slot the action cards
// render into - owner ruling 2026-09-05 (判决 → 建议 → 动作).
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

const TONE_CLASS: Record<BriefCell["tone"], string> = {
  good: "border-s-(color:--success-border)",
  warn: "border-s-(color:--warning-border)",
  bad: "border-s-(color:--danger-border)",
};

const TONE_TEXT: Record<BriefCell["tone"], string> = {
  good: "text-(color:--success-text)",
  warn: "text-(color:--warning-text)",
  bad: "text-(color:--danger-text)",
};

export async function WarRoom({
  cells,
  children,
}: {
  readonly cells: readonly BriefCell[];
  /** The action cards, worst-first - each its own client island. */
  readonly children?: ReactNode;
}) {
  const { WAR_ROOM_TEXT } = await getMessages();
  const findings = cells.filter((c) => c.tone !== "good").length;
  return (
    <Section
      icon="target"
      title={WAR_ROOM_TEXT.title}
      description={findings === 0 ? WAR_ROOM_TEXT.allClear : WAR_ROOM_TEXT.findings(findings)}
    >
      {/* One cell per dimension. minmax(0,1fr) so a long headline wraps inside
          its cell instead of pushing the strip sideways. */}
      <div className="grid gap-sm sm:grid-cols-2 xl:grid-cols-5">
        {cells.map((c) => (
          <Card key={c.key} className={`border-s-2 p-md ${TONE_CLASS[c.tone]}`}>
            <p className="text-muted-foreground text-body-sm">{WAR_ROOM_TEXT.cell[c.key]}</p>
            <p className={`mt-xs text-body-sm font-medium ${c.tone === "good" ? "text-foreground" : TONE_TEXT[c.tone]}`}>
              {c.headline}
            </p>
            {c.detail ? (
              <p className="text-muted-foreground mt-xs text-body-sm">{c.detail}</p>
            ) : null}
          </Card>
        ))}
      </div>
      {children ? <div className="mt-md flex flex-col gap-sm">{children}</div> : null}
    </Section>
  );
}
