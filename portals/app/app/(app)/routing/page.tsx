import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { listLeads } from "../../domains/signal/service";
import { listAccounts } from "../../domains/account/service";
import { RoutingTable, type RoutingRow } from "../components/routing-table";
import { RoutingAnalyseButton } from "../components/routing-analyse-button";
import { loadFailureText } from "../lib/load-failure";

// D5 线索分派 - the list of open leads, and a button that asks the router what
// it thinks.
//
// THE PAGE READS LEADS, NOT ROUTES (owner, 2026-09-06). It used to run the
// whole routing rule on every render - reading territories, resolving every
// region, deciding every lead - to draw a statistics strip, three charts and a
// suggestion column. All of that was the analysis, and the analysis is now
// something a person ASKS for: it happens in a server action, and its result
// lives in the assistant panel with 采纳 / 重新分析 / 放弃.
//
// So this route no longer touches territories at all. What is left is what a
// list of leads needs: who they are, who holds them, and the region - which is
// a fact ABOUT a lead rather than a conclusion about it, and the fact the
// router turns on when somebody does ask.

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const { LOAD_ERROR, ROUTING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [leads, accounts] = await Promise.all([
    listLeads({ ...base, store: session.stores.signal() }, { limit: 500 }),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);

  if (!leads.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(leads.violations, LOAD_ERROR)}
      />
    );
  }

  // The lead -> region hop. A lead knows its account; the account knows its
  // region. A FAILED ACCOUNT READ LEAVES THE COLUMN EMPTY rather than failing
  // the page: the region is one column of a list, and a reader who cannot see
  // accounts can still work the leads they hold.
  const regionOf = new Map(
    (accounts.ok ? accounts.value : []).map((a) => [a.id, a.region]),
  );

  // Open leads only - converted and disqualified ones have settled ownership,
  // which is the same cut previewRouting makes when it is asked.
  const rows: RoutingRow[] = leads.value
    .filter((l) => l.status !== "converted" && l.status !== "disqualified")
    .map((l) => ({
      leadId: l.id,
      leadNo: l.leadNo,
      companyName: l.companyName,
      currentOwner: l.ownerSub,
      region: l.accountId ? (regionOf.get(l.accountId) ?? null) : null,
    }));

  return (
    <ViewLayout>
      {/* TITLE ONLY (owner, 2026-09-06: 页面头部去掉下拉展示内容，只留标题).
          The statistics strip and the analysis block that used to sit here
          made a queue of leads read as a dashboard; what this page is for is
          the list, and the thinking now happens behind the button on the
          right - in the assistant, where its result belongs. */}
      <ViewHeader title={ROUTING_TEXT.title} action={<RoutingAnalyseButton />} />

      <RoutingTable rows={rows} />
    </ViewLayout>
  );
}
