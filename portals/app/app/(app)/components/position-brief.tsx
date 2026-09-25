import { Badge } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { JudgementNote, type Judgement } from "./judgement-note";

// The position, read as a pursuit rather than a record - in PIECES since deal
// batch 2 (2026-09-25). The four blocks of the old brief each went to the one
// panel that owns their fact (YC-069, each fact in one place):
//   - the problems (judgements) and this deal's proposals -> 态势判决;
//   - the rival mentions -> 竞争态势;
//   - the customer's delivery projects and its own proposals -> 客户引用 (栏1).
//
// TWO THINGS IT STILL DELIBERATELY DOES NOT DO.
//
// It does not invent a competitor. Rivals appear only inside raw follow-up
// notes, so they are quoted verbatim; the structured competitor record is
// batch 7 (0089). A pursuit review that names an opponent nobody recorded is
// worse than one that admits it cannot see them.
//
// And the plan is NOT a text box. Under ADR-003 the agent proposes and a human
// signs; a free-form "next steps" field would become a second TODO list nobody
// maintains, and it would carry none of the evidence the proposals carry.

export interface PositionProposal {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly rationale: string | null;
  readonly confidence: number | null;
}

/** 判断: the rules' judgements that landed on this deal or its customer. */
export async function DealJudgements({ problems }: { readonly problems: readonly (Judgement & { readonly id: string })[] }) {
  const { POSITION_TEXT } = await getMessages();
  if (problems.length === 0) {
    return <p className="text-muted-foreground text-body-sm">{POSITION_TEXT.noProblems}</p>;
  }
  return (
    <div className="flex flex-col gap-sm">
      {problems.map((p) => (
        // One rendering of a judgement everywhere: claim, source, staleness,
        // and on open the trigger condition and the rows it cites.
        <JudgementNote key={p.id} judgement={p} />
      ))}
    </div>
  );
}

/** 参谋提案: this deal's own proposals, grouped by the capability that made them. */
export async function DealProposals({ proposals }: { readonly proposals: readonly PositionProposal[] }) {
  const { POSITION_TEXT } = await getMessages();
  if (proposals.length === 0) {
    return <p className="text-muted-foreground text-body-sm">{POSITION_TEXT.planEmpty}</p>;
  }
  return (
    <div className="flex flex-col">
      {proposals.map((p) => (
        <div key={p.id} className="border-border flex flex-wrap items-start gap-md border-b py-sm last:border-b-0">
          <Badge variant="outline">{p.group}</Badge>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-body-sm">{p.title}</p>
            {p.rationale ? (
              <p className="text-muted-foreground mt-2xs max-w-[62ch] text-body-sm">{p.rationale}</p>
            ) : null}
          </div>
          {p.confidence !== null ? (
            <span className="text-muted-foreground shrink-0 text-body-sm tabular-nums">
              {POSITION_TEXT.confidence(p.confidence)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Rival mentions, verbatim - the only competitive evidence that exists. */
export async function RivalMentions({
  mentions,
}: {
  readonly mentions: readonly { id: string; when: string; text: string }[];
}) {
  const { POSITION_TEXT } = await getMessages();
  return (
    <div className="flex flex-col">
      <p className="text-muted-foreground text-body-sm">
        {mentions.length > 0 ? POSITION_TEXT.competitionNone : POSITION_TEXT.competitionNoMention}
      </p>
      {mentions.map((m) => (
        <blockquote key={m.id} className="border-warning/50 mt-sm max-w-[62ch] border-l-2 pl-sm">
          <cite className="text-muted-foreground block text-body-sm not-italic tabular-nums">{m.when}</cite>
          <p className="text-muted-foreground text-body-sm leading-relaxed">{m.text}</p>
        </blockquote>
      ))}
    </div>
  );
}
