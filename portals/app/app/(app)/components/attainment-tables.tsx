"use client";
import { CollectionTable, CollectionTitleCell } from "./collection-table";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EmptyState,
  useListPagination,
} from "@vxture/design-ui";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { dealWorkspaceHref } from "../lib/deal-workspace";
import { PaginationFooter, RowActions, useTableSort } from "./table-fittings";
import { Tag } from "./tag";
import { MemberName, useMemberName } from "../lib/member-names";

const LINK =
  "text-foreground no-underline transition-colors hover:text-primary-text focus-visible:text-primary-text focus-visible:ring-2 focus-visible:ring-ring";
export interface AttainmentDealRow {
  id: string;
  name: string;
  accountId: string;
  accountName: string | null;
  amount: number | null;
  currency: string;
  category: string;
  expectedCloseAt: string | null;
  ownerSub: string;
  status?: string;
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
    ATTAINMENT_PLAN_TEXT: PT,
    ATTAINMENT_DEPLOYMENT_TEXT: D,
  } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const nameOf = useMemberName();
  const table = useTableSort(rows, { deal: r => r.name, amount: r => r.amount, category: r => r.category, date: r => r.expectedCloseAt, owner: r => nameOf(r.ownerSub) });
  const paging = useListPagination(table.rows);
  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <CollectionTable
        sort={table.sort} onSortChange={table.onSortChange}
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
            header: T.deal, track: "subject", sortable: true,
            cell: (r: AttainmentDealRow) => (
              <CollectionTitleCell
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
            header: T.amount, track: "amount", align: "right", sortable: true,
            cell: (r: AttainmentDealRow) => (
              <span className="whitespace-nowrap tabular-nums">
                {formatMoney(r.amount, r.currency, locale)}
              </span>
            ),
          },
          {
            id: "category",
            header: T.category, track: "category", sortable: true,
            cell: (r: AttainmentDealRow) => (
              <Tag>
                {r.status === "won" ? FORECAST_LABEL.closed : FORECAST_LABEL[r.category as keyof typeof FORECAST_LABEL] ?? r.category}
              </Tag>
            ),
          },
          {
            id: "date",
            header: D.date, track: "reference", sortable: true,
            cell: (r: AttainmentDealRow) => r.expectedCloseAt ?? "-",
          },
          {
            id: "owner",
            header: PT.owner, track: "reference", sortable: true,
            cell: (r: AttainmentDealRow) => <MemberName sub={r.ownerSub}/>,
          },
        ]}
        empty={<EmptyState title={T.noDeals} />}
      />
      <PaginationFooter pagination={paging} total={rows.length} />
    </div>
  );
}
