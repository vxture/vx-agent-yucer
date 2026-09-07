import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { listAccounts } from "../../../domains/account/service";
import { LeadForm } from "../../components/lead-form";
import { saveLead } from "../assign-actions";

// 添加线索 - a lead nobody's signal produced.
//
// 智探 IS ONE SOURCE, NOT THE ONLY ONE (owner, 2026-09-06). A lead from an
// exhibition, a phone call or a referral has no signal behind it, and until
// this page the only way a lead could exist was `promoteSignal` - so a real
// enquiry could not be written down unless the machine had found it first.

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const { LEAD_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />
    );
  }
  if (!can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed) {
    redirect("/lead");
  }

  const accounts = await listAccounts({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  });

  return (
    <ViewLayout>
      <ViewHeader title={LEAD_TEXT.addLead} description={LEAD_TEXT.addLeadWhy} />
      <LeadForm
        accounts={(accounts.ok ? accounts.value : []).map((a) => ({ id: a.id, name: a.name }))}
        onSave={saveLead}
      />
    </ViewLayout>
  );
}
