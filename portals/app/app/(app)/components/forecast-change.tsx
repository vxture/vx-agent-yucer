import Link from "next/link";
import { Card, EmptyState, Section } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { Tag } from "./tag";
import type { CategoryChange, ChangeKind } from "../../domains/pipeline/lib/forecast-change";

// 快照间变化 on 预测检视台 (YC-069 section 11 ②, deal batch 9c).
//
// One block per category: the total move since the last snapshot, each kind's
// share, and the deals themselves - every item opens to its deal. What the
// claim log cannot account for is its own line with its amount (R9: never
// spread over the kinds), and only shows when it is not zero.

const KIND_TONE: Record<ChangeKind, "success" | "danger" | "warning" | "neutral"> = {
  added: "success",
  won: "success",
  resized: "neutral",
  pushed: "warning",
  removed: "danger",
};

export async function ForecastChange({
  change,
  labels,
  wan,
}: {
  /** null = no snapshot yet for this period and scope. */
  readonly change: { readonly since: Date; readonly blocks: readonly { readonly key: string; readonly change: CategoryChange }[] } | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly wan: (n: number) => string;
}) {
  const { FORECAST_CHANGE_TEXT: T } = await getMessages();
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${wan(Math.abs(n))}`;
  return (
    <Section
      icon="clock-counter-clockwise"
      title={T.title}
      description={change ? T.since(change.since.toISOString().slice(0, 10)) : T.why}
    >
      {!change ? (
        <div>
          <EmptyState title={T.emptyTitle} description={T.emptyDescription} />
        </div>
      ) : (
        <div className="flex flex-col gap-md">
          {change.blocks.map(({ key, change: c }) => (
            <Card key={key} className="p-md">
              <p className="text-foreground text-body font-semibold tabular-nums">
                {T.headline(labels[key] ?? key, signed(c.total))}
              </p>
              <p className="text-muted-foreground mt-2xs flex flex-wrap gap-x-md gap-y-2xs text-body-small tabular-nums">
                {(Object.entries(c.byKind) as [ChangeKind, number][])
                  .filter(([, v]) => v !== 0)
                  .map(([k, v]) => (
                    <span key={k}>
                      {T.kind[k]} {signed(v)}
                    </span>
                  ))}
                {c.unexplained !== 0 ? (
                  <span className="text-warning" title={T.unexplainedWhy}>
                    {T.unexplained} {signed(c.unexplained)}
                  </span>
                ) : null}
                {c.total === 0 && c.deals.length === 0 ? <span>{T.none}</span> : null}
              </p>
              {c.deals.length > 0 ? (
                <ol className="mt-sm flex flex-col">
                  {c.deals.map((d) => (
                    <li
                      key={d.opportunityId}
                      className="border-border grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-sm border-b border-dashed py-xs text-body-small last:border-b-0"
                    >
                      <Tag tone={KIND_TONE[d.kind]}>{T.kind[d.kind]}</Tag>
                      <Link href={`/pipeline/${d.opportunityId}`} className="text-foreground truncate hover:underline">
                        {d.name}
                      </Link>
                      <span className="text-foreground tabular-nums">{signed(d.delta)}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
