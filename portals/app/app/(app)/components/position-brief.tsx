import Link from "next/link";
import { Badge, Card, SectionHeader, StatusBadge } from "@vxture/design-ui";
import { POSITION_TEXT } from "../lib/messages";
import { LEVEL_INK } from "../lib/view-model";

// The position: an opportunity read as a pursuit rather than a record.
//
// Four blocks in the order a deal review actually runs - whose position this
// is, what the other side looks like, what our own side looks like, and what we
// intend to do. Presentation only; every number arrives already gated.
//
// TWO THINGS IT DELIBERATELY DOES NOT DO.
//
// It does not invent a competitor. There is no structured competitive data in
// this product - rivals appear only inside raw follow-up notes - so the block
// quotes those notes verbatim and offers the analysis that would change that.
// A pursuit review that names an opponent nobody recorded is worse than one
// that admits it cannot see them.
//
// And the plan is NOT a text box. Under ADR-003 the agent proposes and a human
// signs; a free-form "next steps" field would become a second TODO list nobody
// maintains, and it would carry none of the evidence the proposals carry.

export interface PositionFact {
  readonly label: string;
  readonly value: string;
  readonly tone?: "bad" | "warn" | "good";
}

export interface PositionProposal {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly rationale: string | null;
  readonly confidence: number | null;
}

export interface PositionBriefProps {
  readonly chain: readonly PositionFact[];
  readonly projects: readonly {
    id: string;
    name: string;
    health: string;
    href: string;
  }[];
  /** Verbatim note fragments that mention a rival. Never a name we inferred. */
  readonly rivalMentions: readonly { id: string; when: string; text: string }[];
  readonly problems: readonly {
    id: string;
    claim: string;
    rule: string | null;
  }[];
  readonly proposals: readonly PositionProposal[];
}

export function PositionBrief({
  chain,
  projects,
  rivalMentions,
  problems,
  proposals,
}: PositionBriefProps) {
  return (
    <div className="flex flex-col gap-md">
      {/* ---- The other side ------------------------------------------------ */}
      <Card className="p-md">
        <SectionHeader
          level={3}
          title={POSITION_TEXT.external}
          description={POSITION_TEXT.externalWhy}
        />

        <div className="mt-md">
          <p className="text-muted-foreground text-xs">{POSITION_TEXT.chain}</p>
          <div className="mt-xs flex flex-wrap gap-lg">
            {chain.map((f) => (
              <div key={f.label}>
                <div
                  className={[
                    "text-label-lg tabular-nums",
                    f.tone ? LEVEL_INK[f.tone] : "text-foreground",
                  ].join(" ")}
                >
                  {f.value}
                </div>
                <div className="text-muted-foreground text-xs">{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-border mt-md border-t pt-md">
          <p className="text-muted-foreground text-xs">
            {POSITION_TEXT.projects}
          </p>
          {projects.length === 0 ? (
            <p className="text-muted-foreground mt-xs text-body-sm">
              {POSITION_TEXT.noProjects}
            </p>
          ) : (
            <div className="mt-xs flex flex-wrap gap-xs">
              {projects.map((p) => (
                <Link key={p.id} href={p.href}>
                  <StatusBadge
                    tone={
                      p.health === "red"
                        ? "danger"
                        : p.health === "amber"
                          ? "warning"
                          : "success"
                    }
                  >
                    {p.name}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="border-border mt-md border-t pt-md">
          <p className="text-muted-foreground text-xs">
            {POSITION_TEXT.competition}
          </p>
          <p className="text-muted-foreground mt-xs text-body-sm">
            {rivalMentions.length > 0
              ? POSITION_TEXT.competitionNone
              : POSITION_TEXT.competitionNoMention}
          </p>
          {/* Verbatim. The only competitive evidence that exists is what someone
              wrote down, so it is quoted rather than summarised into a claim. */}
          {rivalMentions.map((m) => (
            <blockquote
              key={m.id}
              className="border-warning/50 mt-sm max-w-[62ch] border-l-2 pl-sm"
            >
              <cite className="text-muted-foreground block text-xs not-italic tabular-nums">
                {m.when}
              </cite>
              <p className="text-muted-foreground text-body-sm leading-relaxed">
                {m.text}
              </p>
            </blockquote>
          ))}
        </div>
      </Card>

      {/* ---- Our side ------------------------------------------------------ */}
      <Card className="p-md">
        <SectionHeader
          level={3}
          title={POSITION_TEXT.internal}
          description={POSITION_TEXT.internalWhy}
        />
        <div className="mt-md">
          <p className="text-muted-foreground text-xs">
            {POSITION_TEXT.problems}
          </p>
          <p className="text-muted-foreground mt-2xs text-xs">
            {POSITION_TEXT.problemsWhy}
          </p>
          {problems.length === 0 ? (
            <p className="text-muted-foreground mt-sm text-body-sm">
              {POSITION_TEXT.noProblems}
            </p>
          ) : (
            <div className="mt-sm flex flex-col gap-sm">
              {problems.map((p) => (
                <div
                  key={p.id}
                  className="bg-muted/40 border-border rounded-md border p-sm"
                >
                  <p className="text-foreground max-w-[62ch] text-body-sm">
                    {p.claim}
                  </p>
                  {/* The trigger condition, so a reader can disagree with the
                      arithmetic rather than with the conclusion. */}
                  {p.rule ? (
                    <code className="bg-card text-muted-foreground mt-xs block max-w-[62ch] rounded-md px-sm py-xs text-xs">
                      {p.rule}
                    </code>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ---- The plan ------------------------------------------------------ */}
      <Card className="p-md">
        <SectionHeader
          level={3}
          title={POSITION_TEXT.plan}
          description={POSITION_TEXT.planWhy}
        />
        {proposals.length === 0 ? (
          <p className="text-muted-foreground mt-md text-body-sm">
            {POSITION_TEXT.planEmpty}
          </p>
        ) : (
          <div className="mt-md flex flex-col">
            {proposals.map((p) => (
              <div
                key={p.id}
                className="border-border flex flex-wrap items-start gap-md border-b py-sm last:border-b-0"
              >
                <Badge variant="outline">{p.group}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-body-sm">{p.title}</p>
                  {p.rationale ? (
                    <p className="text-muted-foreground mt-2xs max-w-[62ch] text-xs">
                      {p.rationale}
                    </p>
                  ) : null}
                </div>
                {p.confidence !== null ? (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {POSITION_TEXT.confidence(p.confidence)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
