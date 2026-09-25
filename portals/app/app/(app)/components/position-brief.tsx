import { getMessages } from "../lib/i18n/server";
import { JudgementNote, type Judgement } from "./judgement-note";

// The position, read as a pursuit rather than a record - in PIECES since deal
// batch 2 (2026-09-25). The four blocks of the old brief each went to the one
// panel that owns their fact (YC-069, each fact in one place):
//   - the problems (judgements) -> 态势判决;
//   - this deal's proposals -> 栏3 本单参谋 (the deck, deal batch 2c);
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
