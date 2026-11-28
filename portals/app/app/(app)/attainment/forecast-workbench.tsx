"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  NativeSelect,
  Pagination,
  Section,
  useListPagination,
} from "@vxture/design-system";
import type { ForecastRow } from "../components/forecast-roster";
import { applySuggestedCategory } from "../forecast/actions";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import { BusinessLink, Discuss, Owner } from "./widgets";
import { dealDiagnosis } from "./deal-diagnosis";
import { moneyScale } from "./format";
import type { AttainmentAnalysis } from "./analysis-board";
import styles from "./workspace.module.css";

export function ForecastWorkbench({
  rows,
  data,
  canApply,
}: {
  rows: ForecastRow[];
  data: AttainmentAnalysis;
  canApply: boolean;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    { DS_LABELS, FORECAST_LABEL, FORECAST_RULE_ERROR, FORECAST_RULE_TEXT } = useMessages(),
    router = useRouter(),
    [filter, setFilter] = useState("attention"),
    [selected, setSelected] = useState<string | null>(null),
    [pending, start] = useTransition(),
    [error, setError] = useState<string | null>(null),
    detail = useRef<HTMLElement>(null);
  const issue = (r: ForecastRow) => {
    const d = data.deals?.find((d) => d.id === r.opportunityId);
    return d ? dealDiagnosis(d, data.observedAt, data.review?.[d.id]) : null;
  };
  const shown = rows.filter(
      (r) =>
        filter === "all" ||
        !r.agrees ||
        r.amount === null ||
        r.caps.length ||
        issue(r)?.issues.length,
    );
  const pagination = useListPagination(shown, 6);
  const focus = pagination.pageRows.find((r) => r.opportunityId === selected) ?? pagination.pageRows[0],
    label = (category: string) =>
      FORECAST_LABEL[category as keyof typeof FORECAST_LABEL] ?? T.unknown;
  const groups = new Map<string, { name: string; rows: ForecastRow[] }>();
  for (const row of shown) {
    const deal = data.deals?.find((d) => d.id === row.opportunityId),
      account = data.accounts?.find((a) => a.id === deal?.accountId),
      key = account?.id ?? row.opportunityId,
      group = groups.get(key) ?? {
        name: account?.name ?? T.accountDetail,
        rows: [],
      };
    group.rows.push(row);
    groups.set(key, group);
  }
  const visible = new Set(pagination.pageRows.map((row) => row.opportunityId));
  const pageGroups = [...groups].map(([key, group]) => [key, {
    ...group,
    total: group.rows.length,
    rows: group.rows.filter((row) => visible.has(row.opportunityId)),
  }] as const).filter(([, group]) => group.rows.length);
  const amount = (r: ForecastRow) => {
    const currency =
        data.deals?.find((d) => d.id === r.opportunityId)?.amount?.currency ??
        data.currency ??
        "CNY",
      unit = moneyScale(locale, currency);
    return r.amount === null
      ? T.unpriced
      : `${(r.amount / unit.divisor).toLocaleString(locale)} ${unit.label}`;
  };
  const deal = data.deals?.find((d) => d.id === focus?.opportunityId),
    account = data.accounts?.find((a) => a.id === deal?.accountId),
    review = deal ? data.review?.[deal.id] : null,
    diagnosis = focus ? issue(focus) : null,
    next =
      focus?.amount === null
        ? T.verifyAmount
        : diagnosis?.issues.some((k) => k === "delayed" || k === "undated")
          ? T.alignDate
          : deal?.forecastCategory === "commit"
            ? T.verifyConditions
            : T.keepMoving;
  const reason = (r: ForecastRow) => {
    const diagnosis = issue(r);
    return diagnosis?.issues.length
      ? T[diagnosis.kind]
      : r.caps.length
        ? r.caps
            .map((c) => FORECAST_RULE_TEXT.cap[c] ?? T.checkEvidence)
            .join(" \u00b7 ")
        : r.suggested && !r.agrees
          ? `${T.suggestedCategory} ${label(r.suggested)}`
          : T.normal;
  };
  return (
    <Section level={3} icon="shield-check" title={T.forecastReview}>
      {error && (
        <p className="text-body-small text-destructive-text" role="alert">
          {error}
        </p>
      )}
      <Card className={styles.workbench}>
        <div className={styles.workbenchToolbar} data-control-size="preserve">
          <span className="text-body-small text-muted-foreground">
            {shown.length} {T.projectCount}
          </span>
          <NativeSelect
            wrapperClassName={styles.compactSelect}
            className="h-control-md min-h-control-md text-body-small"
            aria-label={T.status}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
              pagination.resetPage();
            }}
          >
            <option value="attention">{T.attention}</option>
            <option value="all">{T.all}</option>
          </NativeSelect>
        </div>
        {shown.length ? (
          <div className={styles.workbenchGrid}>
            <div
              className={styles.workbenchList}
              role="group"
              aria-label={T.selectProject}
            >
              {pageGroups.map(([key, group]) => (
                <section key={key} className={styles.workbenchGroup}>
                  <header>
                    <Icon name="building-office" size="sm" />
                    <strong>{group.name}</strong>
                    <span>
                      {group.total} {T.projectCount}
                    </span>
                  </header>
                  {group.rows.map((r) => {
                    const d = data.deals?.find((d) => d.id === r.opportunityId);
                    return (
                      <button
                        type="button"
                        data-control-kind="structural"
                        key={r.opportunityId}
                        className={styles.projectChoice}
                        data-control-size="preserve"
                        aria-pressed={focus?.opportunityId === r.opportunityId}
                        onClick={() => {
                          setSelected(r.opportunityId);
                          if (
                            detail.current &&
                            detail.current.parentElement!.clientWidth < 600
                          )
                            detail.current.scrollIntoView({
                              block: "nearest",
                              behavior: matchMedia(
                                "(prefers-reduced-motion: reduce)",
                              ).matches
                                ? "instant"
                                : "smooth",
                            });
                        }}
                      >
                        <Icon
                          name="folder"
                          size="sm"
                          className="text-primary-text"
                        />
                        <span className={styles.projectChoiceCopy}>
                          <span className={styles.projectChoiceTitle}>
                            <strong>{r.dealName}</strong>
                            <span>{amount(r)}</span>
                          </span>
                          <span className={styles.projectChoiceMeta}>
                            <Owner
                              sub={d?.ownerSub ?? null}
                              members={data.members}
                            />
                            <span>{label(r.filed)}</span>
                          </span>
                          <span className="text-warning-text text-body-small">
                            {reason(r)}
                          </span>
                        </span>
                        <Icon name="chevron-right" size="sm" />
                      </button>
                    );
                  })}
                </section>
              ))}
              {pagination.pageCount > 1 && (
                <Pagination
                  page={pagination.page}
                  pageCount={pagination.pageCount}
                  onPageChange={(page) => {
                    pagination.onPageChange(page);
                    setSelected(null);
                  }}
                  countLabel={`${shown.length} ${T.projectCount}`}
                  firstLabel={locale.startsWith("zh") ? "\u9996\u9875" : "First page"}
                  lastLabel={locale.startsWith("zh") ? "\u672b\u9875" : "Last page"}
                  previousLabel={DS_LABELS.paginationPrevious}
                  nextLabel={DS_LABELS.paginationNext}
                />
              )}
            </div>
            <aside
              className={styles.workbenchFocus}
              ref={detail}
              aria-live="polite"
              aria-label={T.projectReview}
            >
              {focus && (
                <>
                  <div>
                    <h3 className={styles.projectTitle}>
                      <BusinessLink
                        href={`/pipeline/${focus.opportunityId}`}
                        icon="arrow-right"
                      >
                        {focus.dealName}
                      </BusinessLink>
                    </h3>
                    <p className="mt-sm text-body-small text-muted-foreground">
                      {account?.name ?? focus.opportunityNo} {"\u00b7"}{" "}
                      {T.projectReview}
                    </p>
                  </div>
                  <section>
                    <span className="text-body-small text-muted-foreground">
                      {T.evidence}
                    </span>
                    <p className="mt-sm text-warning-text">{reason(focus)}</p>
                    {review?.exit && (
                      <p className="mt-sm text-body-small text-muted-foreground">
                        {[...review.exit.unmet, ...review.exit.unknown]
                          .slice(0, 3)
                          .join(" \u00b7 ")}
                      </p>
                    )}
                  </section>
                  <section>
                    <span className="text-body-small text-muted-foreground">
                      {T.nextStep}
                    </span>
                    <p className="mt-sm font-medium">{next}</p>
                    <dl className={styles.workbenchFacts}>
                      <dt>{T.owner}</dt>
                      <dd>
                        <Owner
                          sub={deal?.ownerSub ?? null}
                          members={data.members}
                        />
                      </dd>
                      <dt>{T.amount}</dt>
                      <dd className="tabular-nums">{amount(focus)}</dd>
                      <dt>{T.closeDate}</dt>
                      <dd>
                        {deal?.expectedCloseAt?.slice(0, 10) ?? T.dateUnknown}
                      </dd>
                      <dt>{T.filedCategory}</dt>
                      <dd>{label(focus.filed)}</dd>
                      {focus.suggested && !focus.agrees && (
                        <>
                          <dt>{T.suggestedCategory}</dt>
                          <dd className="text-warning-text">
                            {label(focus.suggested)}
                          </dd>
                        </>
                      )}
                    </dl>
                  </section>
                  <footer className={styles.workbenchActions}>
                    {canApply && focus.suggested && !focus.agrees && (
                      <Button
                        size="xl"
                        variant="secondary"
                        className="text-body-small"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const result = await applySuggestedCategory({
                              opportunityId: focus.opportunityId,
                            });
                            if (result.ok) {
                              setError(null);
                              router.refresh();
                            } else
                              setError(
                                FORECAST_RULE_ERROR[
                                  result.error as keyof typeof FORECAST_RULE_ERROR
                                ] ?? T.retry,
                              );
                          })
                        }
                      >
                        {T.applyCategory}
                      </Button>
                    )}
                    <Button
                      asChild
                      size="xl"
                      variant="ghost"
                      className="text-body-small"
                    >
                      <BusinessLink
                        href={`/pipeline/${focus.opportunityId}`}
                        icon="file-text"
                      >
                        {T.checkEvidence}
                      </BusinessLink>
                    </Button>
                    <Discuss
                      objects={[
                        { kind: "opportunity", id: focus.opportunityId },
                        ...(account
                          ? [{ kind: "account" as const, id: account.id }]
                          : []),
                      ]}
                      context={`${account?.name ?? ""}; ${focus.dealName}; ${data.period}; ${T.amount} ${amount(focus)}; ${T.filedCategory} ${label(focus.filed)}; ${T.evidence} ${reason(focus)}; ${T.nextStep} ${next}`}
                    />
                  </footer>
                </>
              )}
            </aside>
          </div>
        ) : (
          <div className={styles.sectionCard}>
            <EmptyState
              title={filter === "attention" ? T.reviewClear : T.noData}
            />
          </div>
        )}
      </Card>
    </Section>
  );
}
