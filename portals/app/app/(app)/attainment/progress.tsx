import Link from "next/link";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  Icon,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { resolveLocale } from "../lib/i18n/locale";
import { formatMoney } from "../lib/view-model";
import { loadFailureText } from "../lib/load-failure";
import {
  attainmentHref,
  revenuePool,
  type resolveAttainmentQuery,
} from "../lib/attainment-workspace";
import {
  coverage,
  resolveCoverageFloor,
} from "../../domains/planning/lib/coverage";
import { byProduct } from "../../domains/catalog/lib/pricing";
import { AttainmentDealTable } from "../components/attainment-tables";
import {
  loadAttainmentBase,
  loadAttainmentComposition,
  loadAttainmentPlan,
} from "./board";

export async function AttainmentProgress({
  selection,
}: {
  readonly selection: ReturnType<typeof resolveAttainmentQuery>;
}) {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const {
    ATTAINMENT_TEXT: { workspace: T },
    ATTAINMENT_TEXT,
    SHELL_TEXT,
    LOAD_ERROR,
    ATTAINMENT_PLAN_TEXT: PT,
  } = await getMessages();
  const locale = await resolveLocale();
  if (!data.deals.ok || !data.policy.ok)
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(
          !data.deals.ok
            ? data.deals.violations
            : !data.policy.ok
              ? data.policy.violations
              : [],
          LOAD_ERROR,
        )}
      />
    );
  const slice = revenuePool(
    data.deals.value,
    selection.period,
    selection.scope,
    data.policy.value.defaultCurrency,
  );
  if (!slice) return <EmptyState title={T.periodUnsupported} />;
  const totals = slice.totals.ok ? slice.totals.value : null;
  const currency = data.policy.value.defaultCurrency;
  const money = (n: number) => formatMoney(n, currency, locale);
  const plan = await loadAttainmentPlan(
    Number(selection.period.replace(/^Y/, "").slice(0, 4)),
  );
  const target = plan?.ok
    ? plan.value.targets.find(
        (t) =>
          t.scope === selection.scopeKey &&
          t.period === selection.period &&
          t.currency === currency,
      )
    : null;
  const sameCurrency = target?.currency === currency;
  const openAmount = totals
    ? totals.commitAmount.amount +
      totals.bestCaseAmount.amount +
      totals.pipelineAmount.amount
    : null;
  const cover =
    target && sameCurrency && totals && openAmount !== null
      ? coverage(
          openAmount,
          target.target,
          totals.closedAmount.amount,
          resolveCoverageFloor(process.env.YUCER_COVERAGE_FLOOR),
        )
      : null;
  const composition = await loadAttainmentComposition();
  const ids = new Set(slice.open.map((d) => d.id));
  const lines = composition?.lines.ok
    ? composition.lines.value.filter((l) => ids.has(l.opportunityId))
    : [];
  // Never aggregate multiple line currencies into an unlabelled amount.
  const lineCurrencies = new Set(lines.map((l) => l.currency));
  const products = composition?.products.ok ? composition.products.value : [];
  const split = [...byProduct(lines)].sort((a, b) => b[1].amount - a[1].amount);
  const categoryOrder: Record<string, number> = {
    commit: 0,
    best_case: 1,
    pipeline: 2,
  };
  const accountNameOf = new Map(
    (composition?.accounts.ok ? composition.accounts.value : []).map((a) => [
      a.id,
      a.name,
    ]),
  );
  const rows = [...slice.open]
    .sort(
      (a, b) =>
        (categoryOrder[a.forecastCategory] ?? 3) -
          (categoryOrder[b.forecastCategory] ?? 3) ||
        (b.amount?.amount ?? 0) - (a.amount?.amount ?? 0),
    )
    .map((d) => ({
      id: d.id,
      name: d.name,
      accountId: d.accountId,
      accountName: accountNameOf.get(d.accountId) ?? d.accountName ?? null,
      amount: d.amount?.amount ?? null,
      currency: d.currency,
      category: d.forecastCategory,
      expectedCloseAt: d.expectedCloseAt?.toISOString().slice(0, 10) ?? null,
      ownerSub: d.ownerSub,
    }));
  return (
    <>
      <Section icon="chart-bar" title={T.liveTitle} description={T.liveHint}>
        {totals ? (
          <div className="grid grid-cols-1 gap-x-xl gap-y-md sm:grid-cols-3">
            {[
              { label: PT.commit, value: totals.commitAmount.amount },
              { label: T.bestCase, value: totals.bestCaseAmount.amount },
              { label: T.pipeline, value: totals.pipelineAmount.amount },
            ].map((m) => (
              <div key={m.label} className="flex min-w-0 flex-col gap-2xs">
                <span className="text-body-small text-muted-foreground">
                  {m.label}
                </span>
                <span className="text-label font-semibold tabular-nums">
                  {money(m.value)}
                </span>
              </div>
            ))}
          </div>
        ) : !slice.totals.ok ? (
          <EmptyState
            title={SHELL_TEXT.loadFailed}
            description={loadFailureText(slice.totals.violations, LOAD_ERROR)}
          />
        ) : null}
        {totals ? (
          cover ? (
            <div className="flex flex-wrap items-baseline gap-x-lg gap-y-xs text-body-small">
              <span>
                {T.openPool}{" "}
                <strong className="tabular-nums">
                  {money(openAmount ?? 0)}
                </strong>
              </span>
              {cover.ratio === null ? (
                <StatusBadge tone="success">{T.targetMet}</StatusBadge>
              ) : (
                <>
                  <span>
                    {T.coverage}{" "}
                    <strong className="tabular-nums">
                      {cover.ratio.toFixed(1)}x
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    {T.coverageFloor} {cover.floor.toFixed(1)}x
                  </span>
                  {cover.thin ? (
                    <StatusBadge tone="warning">
                      {ATTAINMENT_TEXT.thin}
                    </StatusBadge>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <p className="text-body-small text-muted-foreground">
              {target && !sameCurrency ? T.currencyMismatch : T.noCoverage}
            </p>
          )
        ) : null}
        {slice.undated > 0 ? (
          <p className="text-body-small text-warning-text">
            {T.undated} ({slice.undated})
          </p>
        ) : null}
        <div>
          <Button asChild size="xl" variant="outline">
            <Link
              href={attainmentHref({
                period: selection.period,
                scope: selection.selection,
                view: "review",
              })}
            >
              {T.reviewNext}
            </Link>
          </Button>
        </div>
      </Section>
      <Section icon="folder" title={T.dealsTitle} description={T.dealsHint}>
        <AttainmentDealTable rows={rows} />
      </Section>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="xl">
            <Icon name="package" size="sm" />
            {T.composition}
            <Icon name="chevron-down" size="sm" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-md pt-md">
            <p className="text-body-small text-muted-foreground">
              {T.compositionHint}
            </p>
            {composition && !composition.lines.ok ? (
              <EmptyState
                title={SHELL_TEXT.loadFailed}
                description={loadFailureText(
                  composition.lines.violations,
                  LOAD_ERROR,
                )}
              />
            ) : composition && !composition.products.ok ? (
              <EmptyState
                title={SHELL_TEXT.loadFailed}
                description={loadFailureText(
                  composition.products.violations,
                  LOAD_ERROR,
                )}
              />
            ) : lineCurrencies.size > 1 ||
              (lineCurrencies.size === 1 && !lineCurrencies.has(currency)) ? (
              <p className="text-body-small text-muted-foreground">
                {T.currencyMismatch}
              </p>
            ) : split.length === 0 ? (
              <p className="text-body-small text-muted-foreground">
                {ATTAINMENT_TEXT.noComposition}
              </p>
            ) : (
              <dl className="flex flex-col gap-sm">
                {split.map(([id, value]) => (
                  <div
                    key={id}
                    className="flex items-baseline justify-between gap-md border-b border-dashed border-border pb-xs text-body-small"
                  >
                    <dt>{products.find((p) => p.id === id)?.name ?? id}</dt>
                    <dd className="tabular-nums">{money(value.amount)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
