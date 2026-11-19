"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, Input, NativeSelect, TableTitleCell, useListPagination } from "@vxture/design-ui";
import type { MarketView } from "../lib/market-strategy";
import { useMessages } from "../lib/i18n/provider";
import { DataTable, FilterBar } from "./business-controls";
import { FilterSlot, PaginationFooter, RowActions, SearchSlot } from "./table-fittings";
import { Tag } from "./tag";
import { StrategyQuantity } from "./strategy-detail-label";
import styles from "./market-customers.module.css";

export function MarketCustomers({ market }: { readonly market: MarketView }) {
  const { MARKET_STRATEGY_TEXT: T, DATA_TABLE_LABELS, SEGMENT_DETAIL_TEXT: D } = useMessages();
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState("");
  const rows = market.customers?.filter(a => (!match || (match === "assigned" ? a.assigned : a.match === match)) && (!query.trim() || `${a.name} ${a.accountNo}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) ?? [];
  const pagination = useListPagination(rows, 10);
  if (market.customers === null) return <p className="text-body text-muted-foreground">{T.unknown}</p>;
  return <div className="flex min-w-0 flex-col gap-md" data-market-customer-coverage>
    <div className={styles.toolbarScroll}>
    <FilterBar className={styles.toolbar} data-market-customer-toolbar
      scope={<dl className={styles.stats} data-market-customer-stats>{[
        { label: T.customerCount, value: market.matched },
        { label: T.assigned, value: market.assigned },
        { label: T.missing, value: market.missing },
      ].map(row => <div key={row.label} className={styles.stat}><dt className="text-body-small text-muted-foreground">{row.label}</dt><dd className="text-body font-medium"><StrategyQuantity value={row.value ?? "-"} unit={row.value == null ? undefined : D.customerUnit} /></dd></div>)}</dl>}
      search={<SearchSlot><Input type="search" aria-label={T.searchCustomers} placeholder={T.searchCustomers} value={query} onChange={e => setQuery(e.target.value)} /></SearchSlot>}
      onReset={query || match ? () => { setQuery(""); setMatch(""); } : undefined}>
      <FilterSlot><NativeSelect aria-label={T.assessment} value={match} onChange={e => setMatch(e.target.value)}>
        <option value="">{T.allCustomers}</option>
        {(["match", "assigned", "missing", "miss", "undefined"] as const).map(key => <option key={key} value={key}>{T[key]}</option>)}
      </NativeSelect></FilterSlot>
    </FilterBar>
    </div>
    <DataTable className="[&_tbody]:text-body" labels={DATA_TABLE_LABELS} rows={pagination.pageRows} rowKey={a => a.id} indexStart={pagination.indexStart}
      columns={[
        { id: "name", header: T.customerName, align: "left", width: "md", cell: a => <TableTitleCell title={<Link href={`/account/${encodeURIComponent(a.id)}`} className="no-underline transition-colors hover:text-primary-text hover:no-underline">{a.name}</Link>} description={a.accountNo} /> },
        { id: "industry", header: T.industry, align: "left", width: "sm", cell: a => <span className="line-clamp-2" title={a.industry ?? undefined}>{a.industry || "-"}</span> },
        { id: "size", header: T.size, width: "xs", cell: a => a.customerSize || "-" },
        { id: "region", header: T.region, width: "xs", cell: a => a.region || "-" },
        { id: "assessment", header: T.assessment, width: "sm", cell: a => <div className="flex flex-wrap items-center justify-center gap-xs"><Tag tone={a.match === "match" ? "success" : a.match === "missing" ? "warning" : "neutral"}>{T[a.match]}</Tag>{a.assigned ? <Tag>{T.assigned}</Tag> : null}</div> },
      ]}
      rowActions={a => <RowActions items={[{ id: "open", label: D.openCustomer, onSelect: () => { window.location.href = `/account/${encodeURIComponent(a.id)}`; } }]} />}
      empty={<EmptyState title={query || match ? T.noMatches : T.noCustomers} description={query || match ? undefined : T.noCustomersWhy} />} />
    {rows.length ? <div className="min-w-0 max-w-full overflow-x-auto"><PaginationFooter pagination={pagination} total={market.customers.length} filteredTotal={query || match ? rows.length : undefined} /></div> : null}
  </div>;
}
