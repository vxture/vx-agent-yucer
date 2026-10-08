import Link from "next/link";
import { Card, Section } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { Tag } from "./tag";
import type { UnverifiedCategory, UnverifiedReason } from "../../domains/pipeline/lib/unverified";

// 未经证实金额 on 预测检视台 (YC-069 section 11 ①, deal batch 9d): how much
// of 承诺 and 乐观 the rule cannot stand behind, and - one click away - which
// deals and what each lacks. Each deal is judged exactly as its own page
// judges it (pipeline/deal-assessments.ts).

export async function ForecastUnverified({
  blocks,
  labels,
  wan,
}: {
  readonly blocks: readonly UnverifiedCategory[];
  readonly labels: Readonly<Record<string, string>>;
  readonly wan: (n: number) => string;
}) {
  const { FORECAST_UNVERIFIED_TEXT: T } = await getMessages();
  const reason = (r: UnverifiedReason) => {
    switch (r.kind) {
      case "exit_unmet":
        return T.exitUnmet(r.names.join(T.sep));
      case "exit_unknown":
        return T.exitUnknown(r.names.join(T.sep));
      case "exit_unreadable":
        return T.exitUnreadable;
      case "assessment_risk":
        return T.risk(r.score);
    }
  };
  return (
    <Section icon="warning" title={T.title} description={T.why}>
      <div className="flex flex-col gap-md">
        {blocks.map((b) => (
          <Card key={b.category} className="p-md">
            <p className="text-foreground text-body font-semibold tabular-nums">
              {T.headline(labels[b.category] ?? b.category, wan(b.total), wan(b.unverified))}
            </p>
            {b.deals.length === 0 ? (
              <p className="text-muted-foreground mt-2xs text-body-small">{T.none}</p>
            ) : (
              // 点开是哪几单 (YC-069 section 11): the figure leads, the deals
              // are one click away rather than a wall under it.
              <details className="mt-2xs">
                <summary className="text-primary cursor-pointer text-body-small">{T.showDeals(b.deals.length)}</summary>
              <ol className="mt-sm flex flex-col">
                {b.deals.map((d) => (
                  <li
                    key={d.id}
                    className="border-border grid grid-cols-[minmax(0,1fr)_auto] items-start gap-sm border-b border-dashed py-xs text-body-small last:border-b-0"
                  >
                    <div className="min-w-0">
                      <Link href={`/pipeline/${d.id}`} className="text-foreground hover:underline">
                        {d.name}
                      </Link>
                      <div className="mt-2xs flex flex-wrap gap-2xs">
                        {d.reasons.map((r, i) => (
                          <Tag key={i} tone={r.kind === "exit_unmet" || r.kind === "assessment_risk" ? "danger" : "warning"}>
                            {reason(r)}
                          </Tag>
                        ))}
                      </div>
                    </div>
                    <span className="text-foreground tabular-nums">{wan(d.amount)}</span>
                  </li>
                ))}
              </ol>
              </details>
            )}
          </Card>
        ))}
      </div>
    </Section>
  );
}
