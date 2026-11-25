import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { listCampaigns } from "../../domains/strategy/service";
import { listAccounts } from "../../domains/account/service";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { getStrategyStore } from "../../domains/shared/registry";
import { listLeads, listSignals } from "../../domains/signal/service";
import { isPendingSignal } from "../../domains/signal/lib/intelligence";
import { can } from "../../authz/decide";
import { SignalQueue } from "../components/signal-queue";
import { enrichSignals } from "../lib/signal-inbox";
import { actOnSignal, confirmSignalPromotion, dismissSignal, fetchSignalUpdates, matchSignal, saveSignalRegistration } from "./actions";
import { loadFailureText } from "../lib/load-failure";
import { ModuleHeadline } from "../components/module-headline";
import { Tag } from "../components/tag";
import { lockedPage } from "../components/locked-page";
import { getArdaConfig } from "../../platform/arda/source";

export const dynamic = "force-dynamic";

export default async function SignalPage({ searchParams }: {
  readonly searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  const { SIGNAL_TEXT: T, SIGNAL_WORKSPACE_TEXT: W, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  const locked = lockedPage(session, "signal");
  if (locked) return locked;
  const ctx = { workspaceId: session.workspaceId, sub: session.user.sub,
    holder: session.authz, entitlement: session.entitlement, store: session.stores.signal() };
  // Never report an arbitrary first 100 records as the complete inbox. Failed
  // ancillary reads do not blank the evidence list or invent empty relations.
  const [signals, accounts, leads, campaigns] = await Promise.allSettled([
    listSignals(ctx),
    listAccounts({ ...ctx, store: session.stores.account() }),
    listLeads(ctx),
    listCampaigns({ ...ctx, store: getStrategyStore() }),
  ]);
  if (signals.status === "rejected") return <EmptyState title={SHELL_TEXT.loadFailed} description={SHELL_TEXT.loadFailed} />;
  const signalResult = signals.value;
  if (!signalResult.ok) return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(signalResult.violations, LOAD_ERROR)} />;
  const enriched = enrichSignals(signalResult.value);
  const byScore = (a: typeof enriched[number], b: typeof enriched[number]) =>
    (b.recomputed ?? 0) - (a.recomputed ?? 0) || b.record.detectedAt.getTime() - a.record.detectedAt.getTime();
  const groups = [
    { key: "named", title: T.groupNamed, why: T.groupNamedWhy,
      items: enriched.filter(s => s.record.targeting === "named_account").sort(byScore) },
    { key: "domain", title: T.groupDomain, why: T.groupDomainWhy,
      items: enriched.filter(s => s.record.targeting === "product_domain").sort(byScore) },
    { key: "none", title: T.groupNone, why: W.noneNamed,
      items: enriched.filter(s => !["named_account", "product_domain"].includes(s.record.targeting ?? "")).sort(byScore) },
  ];
  const accountOptions = accounts.status === "fulfilled" && accounts.value.ok
    ? accounts.value.value.map(a => ({ id: a.id, name: a.name })) : [];
  const leadBySignal = Object.fromEntries((leads.status === "fulfilled" && leads.value.ok ? leads.value.value : [])
    .filter(l => l.signalId).map(l => [l.signalId!, { id: l.id, name: l.companyName, no: l.leadNo }]));
  const campaignNames = Object.fromEntries((campaigns.status === "fulfilled" && campaigns.value.ok ? campaigns.value.value : []).map(c => [c.id, c.name]));
  const pending = enriched.filter(s => isPendingSignal(s.record));
  return <ViewLayout>
    <ModuleHeadline moduleKey="signal" tags={<>
      {pending.length ? <StatusBadge tone="info">{T.tagSignals(pending.length)}</StatusBadge> : <Tag>{T.leadNone}</Tag>}
      {enriched.length > pending.length ? <Tag>{W.processed} {enriched.length - pending.length}</Tag> : null}
    </>} />
    <SignalQueue groups={groups} campaignNames={campaignNames} accounts={accountOptions} leadBySignal={leadBySignal}
      relatedReadFailed={[accounts, leads, campaigns].some(r => r.status === "rejected" || !r.value.ok)}
      focusId={typeof focus === "string" ? focus : undefined}
      canTriage={can(session.authz, session.entitlement, "signal.triage", "ui").allowed}
      canPromote={can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed}
      canRescore={can(session.authz, session.entitlement, "signal.rescore", "ui").allowed}
      canSync={can(session.authz, session.entitlement, "signal.feed.ingest", "ui").allowed}
      feedConfigured={getArdaConfig().enabled}
      onAct={actOnSignal} onPromote={confirmSignalPromotion} onDismiss={dismissSignal}
      onRegister={saveSignalRegistration} onMatch={matchSignal} onSync={fetchSignalUpdates} />
  </ViewLayout>;
}
