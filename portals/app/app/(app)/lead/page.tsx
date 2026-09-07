import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { listLeads, previewAttribution } from "../../domains/signal/service";
import { LeadList } from "../components/lead-list";
import { ModuleHeadline } from "../components/module-headline";
import { actOnLead } from "../signal/lead-actions";
import { loadFailureText } from "../lib/load-failure";

// 线索管理 - its own module since 2026-09-06 (design_yucer_110).
//
// IT USED TO BE A SECOND LIST ON THE SIGNAL PAGE, which made 商机智探 manage
// two objects at once: signals, whose actions are 升级为线索 / 忽略 / 判重 /
// 重新评分, and leads, whose lifecycle runs new -> working -> qualified ->
// converted with a judgement at every step. One page, two lifecycles, and the
// reader had to work out which list a given action belonged to.
//
// SEPARATE FROM 线索分派, and that stays separate (owner, 2026-09-06).
// Assigning is a team lead's job and working the lead is a rep's; routing
// writes exactly one column (`owner_sub`) and this page walks the status.
// Folding them together would put two roles on one screen.
//
// THE ATTRIBUTION PREVIEW COMES WITH IT. Attribution freezes at conversion and
// can never be corrected afterwards (ADR-016), so the one moment the answer is
// useful is the moment BEFORE the click - which is on this page now, because
// the convert button is.

export const dynamic = "force-dynamic";

export default async function LeadPage() {
  const { LEAD_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.signal(),
  };

  const leads = await listLeads(ctx, { limit: 200 });
  if (!leads.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(leads.violations, LOAD_ERROR)}
      />
    );
  }

  // What each convertible lead WOULD attribute to, before anyone converts.
  // Only qualified leads are asked: the others cannot be converted, and the
  // answer would decorate a door that does not open. Failures degrade to "no
  // preview" rather than failing the page.
  const attributionPreviews = new Map<string, { source: string; campaignId: string | null }>();
  await Promise.all(
    leads.value
      .filter((l) => l.status === "qualified")
      .map(async (l) => {
        const prev = await previewAttribution(ctx, l.id);
        if (prev.ok) {
          attributionPreviews.set(l.id, {
            source: prev.value.source,
            campaignId: prev.value.campaignId,
          });
        }
      }),
  );

  // Counted off the same array the list is built from, so a badge and the
  // table under it cannot describe different leads.
  const open = leads.value.filter(
    (l) => l.status !== "converted" && l.status !== "disqualified",
  ).length;
  const qualified = leads.value.filter((l) => l.status === "qualified").length;
  // UNOWNED IS A HEADLINE NUMBER because it is a BLOCKER now: a lead nobody
  // owns cannot be qualified (2026-09-06), so this count is the size of the
  // queue that cannot move until somebody routes it.
  const unowned = leads.value.filter(
    (l) => l.ownerSub === null && l.status !== "converted" && l.status !== "disqualified",
  ).length;
  const converted = leads.value.filter((l) => l.status === "converted").length;

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="lead"
        description={LEAD_TEXT.moduleWhy}
        tags={
          <>
            <StatusBadge tone="success">{LEAD_TEXT.tagOpen(open)}</StatusBadge>
            {qualified > 0 ? (
              <StatusBadge tone="info">{LEAD_TEXT.tagQualified(qualified)}</StatusBadge>
            ) : null}
            {unowned > 0 ? (
              <StatusBadge tone="warning">{LEAD_TEXT.tagUnowned(unowned)}</StatusBadge>
            ) : null}
            {converted > 0 ? (
              <StatusBadge tone="info">{LEAD_TEXT.tagConverted(converted)}</StatusBadge>
            ) : null}
          </>
        }
      />

      <LeadList
        leads={leads.value}
        attributionPreviews={attributionPreviews}
        canTriage={can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed}
        canConvert={can(session.authz, session.entitlement, "signal.lead.convert", "ui").allowed}
        onAct={actOnLead}
      />
    </ViewLayout>
  );
}
