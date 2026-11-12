"use client";
import { DataTable } from "./business-controls";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EmptyState,
  TableTitleCell,
  useListPagination,
} from "@vxture/design-ui";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import {
  attainmentHref,
  type AttainmentView,
} from "../lib/attainment-workspace";
import { periodRange } from "../../domains/shared/period";
import { dealWorkspaceHref } from "../lib/deal-workspace";
import { PaginationFooter, RowActions } from "./table-fittings";
import { Tag } from "./tag";

const LINK =
  "text-foreground no-underline transition-colors hover:text-primary-text focus-visible:text-primary-text focus-visible:ring-2 focus-visible:ring-ring";
export interface AttainmentPeriodRow {
  period: string;
  target: number;
  currency: string;
  achieved: number | null;
  ratio: number | null;
  error: string | null;
}
export function AttainmentPeriodTable({
  rows,
  scope,
  view,
}: {
  readonly rows: readonly AttainmentPeriodRow[];
  readonly scope: string;
  readonly view: AttainmentView;
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
    DATA_TABLE_LABELS,
  } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  return (
    <DataTable
      leadingSpacer
      indexStart={1}
      rowActions={(r: AttainmentPeriodRow) => (
        <RowActions
          items={
            periodRange(r.period)
              ? [
                  {
                    id: "review",
                    label: T.review,
                    onSelect: () =>
                      router.push(
                        attainmentHref({
                          period: r.period,
                          scope,
                          view: "review",
                        }),
                      ),
                  },
                ]
              : []
          }
        />
      )}
      labels={DATA_TABLE_LABELS}
      rows={[...rows]}
      rowKey={(r: AttainmentPeriodRow) => r.period}
      columns={[
        {
          id: "period",
          header: T.period,
          cell: (r: AttainmentPeriodRow) =>
            periodRange(r.period) ? (
              <Link
                className={LINK}
                href={attainmentHref({ period: r.period, scope, view })}
              >
                {r.period}
              </Link>
            ) : (
              <span>{r.period}</span>
            ),
        },
        {
          id: "target",
          header: T.target,
          cell: (r: AttainmentPeriodRow) =>
            formatMoney(r.target, r.currency, locale),
        },
        {
          id: "achieved",
          header: T.publishedClosed,
          cell: (r: AttainmentPeriodRow) =>
            r.achieved === null ? (
              <span className="text-muted-foreground">
                {r.error ?? T.noPublished}
              </span>
            ) : (
              formatMoney(r.achieved, r.currency, locale)
            ),
        },
        {
          id: "ratio",
          header: T.targetRate,
          cell: (r: AttainmentPeriodRow) =>
            r.ratio === null ? "-" : `${(r.ratio * 100).toFixed(1)}%`,
        },
        {
          id: "gap",
          header: T.publishedGap,
          cell: (r: AttainmentPeriodRow) =>
            r.achieved === null
              ? "-"
              : formatMoney(
                  Math.max(0, r.target - r.achieved),
                  r.currency,
                  locale,
                ),
        },
      ]}
      empty={<EmptyState title={T.noPeriods} description={T.noPeriodsHint} />}
    />
  );
}

export interface AttainmentDealRow {
  id: string;
  name: string;
  accountId: string;
  accountName: string | null;
  amount: number | null;
  currency: string;
  category: string;
  expectedCloseAt: string | null;
}
export function AttainmentDealTable({
  rows,
}: {
  readonly rows: readonly AttainmentDealRow[];
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
    DATA_TABLE_LABELS,
    FORECAST_LABEL,
    PIPELINE_TEXT,
  } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const paging = useListPagination(rows);
  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <DataTable
        leadingSpacer
        indexStart={paging.indexStart}
        rowActions={(r: AttainmentDealRow) => (
          <RowActions
            items={[
              {
                id: "work",
                label: PIPELINE_TEXT.openDeal,
                onSelect: () =>
                  router.push(dealWorkspaceHref(r.id, "progress")),
              },
            ]}
          />
        )}
        labels={DATA_TABLE_LABELS}
        rows={[...paging.pageRows]}
        rowKey={(r: AttainmentDealRow) => r.id}
        columns={[
          {
            id: "deal",
            header: T.deal,
            cell: (r: AttainmentDealRow) => (
              <TableTitleCell
                title={
                  <Link
                    className={LINK}
                    href={`/pipeline/${encodeURIComponent(r.id)}`}
                  >
                    {r.name}
                  </Link>
                }
                description={
                  r.accountName ? (
                    <Link
                      className={LINK}
                      href={`/account/${encodeURIComponent(r.accountId)}`}
                    >
                      {r.accountName}
                    </Link>
                  ) : undefined
                }
              />
            ),
          },
          {
            id: "amount",
            header: T.amount,
            cell: (r: AttainmentDealRow) => (
              <span className="whitespace-nowrap tabular-nums">
                {formatMoney(r.amount, r.currency, locale)}
              </span>
            ),
          },
          {
            id: "category",
            header: T.category,
            cell: (r: AttainmentDealRow) => (
              <Tag>
                {FORECAST_LABEL[r.category as keyof typeof FORECAST_LABEL] ??
                  r.category}
              </Tag>
            ),
          },
          {
            id: "date",
            header: T.expectedClose,
            cell: (r: AttainmentDealRow) => r.expectedCloseAt ?? "-",
          },
        ]}
        empty={<EmptyState title={T.noDeals} />}
      />
      <PaginationFooter pagination={paging} total={rows.length} />
    </div>
  );
}
