"use client";
import { DataTable } from "./business-controls";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Drawer, Field, FieldLabel, Input, Separator, TableTitleCell, useListPagination, useToast } from "@vxture/design-ui";
import type { AccountRecord } from "../../domains/account/store";
import { designateAccountTier, loadAccountOperatingAction } from "../account/actions";
import { operatingValues, operatingPlan, operatingError } from "../lib/account-plan-form";
import { useMessages } from "../lib/i18n/provider";
import { MemberName } from "../lib/member-names";
import { defaultPeriod } from "../lib/periods";
import { AccountOperatingFields } from "./account-operating-fields";
import { Tag } from "./tag";
import { PaginationFooter } from "./table-fittings";

export type NamedCandidate = Pick<AccountRecord, "id" | "name" | "accountNo" | "tier" | "ownerSub"> & { readonly levelName?: string };

/** Two entries into the existing customer workflows, not a second create page. */
export function NamedAccountActions({ accounts }: { readonly accounts: readonly NamedCandidate[] }) {
  const { NAMED_ACCOUNT_TEXT: text, ACCOUNT_ERROR, POSITION_TEXT, DATA_TABLE_LABELS, DS_LABELS } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [operating, setOperating] = useState(() => operatingValues(defaultPeriod()));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, start] = useTransition();
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const q = query.trim().toLocaleLowerCase();
  const filtered = accounts.filter((a) => !q || `${a.name} ${a.accountNo}`.toLocaleLowerCase().includes(q));
  const pagination = useListPagination(filtered, 10);
  const selected = accounts.find((a) => a.id === picked);
  const tierName = (tier: string) => tier === "strategic" ? POSITION_TEXT.tierStrategic : tier === "key" ? POSITION_TEXT.tierKey : POSITION_TEXT.tierStandard;

  // Refresh the original list when returning from the customer creation tab.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [router]);

  useEffect(() => {
    if (!open || !picked) return;
    let current = true;
    setLoading(true);
    setLoadError(false);
    setLoadedId(null);
    void loadAccountOperatingAction(picked).then((r) => {
      if (!current) return;
      if (r.ok) {
        setOperating(operatingValues(defaultPeriod(), r.plan));
        setLoadedId(picked);
      } else setLoadError(true);
    }).catch(() => { if (current) setLoadError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, picked, retry]);

  const submit = () => {
    if (!selected || selected.tier === "strategic" || loadedId !== selected.id || loading || loadError) return;
    const invalid = operatingError("strategic", operating);
    if (invalid) {
      toast({ tone: "danger", title: ACCOUNT_ERROR[invalid] ?? ACCOUNT_ERROR.denied });
      return;
    }
    start(async () => {
      try {
        const r = await designateAccountTier({ accountId: selected.id, tier: "strategic", plan: operatingPlan("strategic", operating) });
        if (!r.ok) {
          toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? ACCOUNT_ERROR.denied });
          return;
        }
        toast({ tone: "success", title: text.linked });
        setOpen(false);
        router.refresh();
      } catch {
        toast({ tone: "danger", title: ACCOUNT_ERROR.denied });
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-sm">
        <Button size="xl" onClick={() => { setQuery(""); setPicked(null); pagination.resetPage(); setOpen(true); }}>{text.link}</Button>
        <Button asChild variant="secondary" size="xl"><a href="/account/new?tier=strategic" target="_blank" rel="noopener noreferrer">{text.create}</a></Button>
      </div>
      <Drawer open={open} onClose={() => { if (!pending) setOpen(false); }} width="md" title={text.linkTitle} description={text.linkWhy} closeLabel={DS_LABELS.confirmCancel}>
        <div className="flex flex-col gap-lg">
          {!selected ? <>
          <Field>
            <FieldLabel htmlFor="named-account-search">{text.search}</FieldLabel>
            <Input id="named-account-search" value={query} placeholder={text.searchPlaceholder} disabled={pending} onChange={(ev) => { setQuery(ev.target.value); pagination.resetPage(); }} />
          </Field>
          <DataTable leadingSpacer indexStart={pagination.indexStart} rows={pagination.pageRows} rowKey={(a) => a.id} labels={DATA_TABLE_LABELS} empty={text.noMatches}
            rowActions={(a: NamedCandidate) => a.tier === "strategic" ? <span className="text-body-small text-muted-foreground">{text.included}</span> : <Button size="md" variant="secondary" disabled={pending} onClick={() => setPicked(a.id)}>{text.select}</Button>}
            columns={[
              { id: "name", header: text.customer, cell: (a: NamedCandidate) => <TableTitleCell title={<Link href={`/account/${a.id}`} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">{a.name}</Link>} description={<>{a.accountNo} / <MemberName sub={a.ownerSub} /></>} /> },
              { id: "tier", header: POSITION_TEXT.designate, cell: (a: NamedCandidate) => <Tag>{a.levelName ?? tierName(a.tier)}</Tag> },
            ]}
          />
          <PaginationFooter pagination={pagination} total={accounts.length} filteredTotal={q ? filtered.length : undefined} />
          </> : <>
            <div className="flex items-center justify-between gap-sm">
              <TableTitleCell title={<Link href={`/account/${selected.id}`} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">{selected.name}</Link>} description={selected.accountNo} />
              <Button variant="secondary" disabled={pending} onClick={() => setPicked(null)}>{text.change}</Button>
            </div>
            <Separator />
            {loading ? <p className="text-body-small text-muted-foreground" role="status">{text.loading}</p> : loadError ? <div className="flex items-center gap-sm"><p role="alert">{text.planLoadFailed}</p><Button variant="secondary" onClick={() => setRetry((v) => v + 1)}>{text.retry}</Button></div> : loadedId === picked ? <AccountOperatingFields tier="strategic" values={operating} onChange={setOperating} disabled={pending} /> : null}
            {loadedId === picked && !loading && !loadError ? (
              <div className="flex justify-end">
                <Button disabled={pending} onClick={submit}>{text.confirm}</Button>
              </div>
            ) : null}
          </>}
        </div>
      </Drawer>
    </>
  );
}
