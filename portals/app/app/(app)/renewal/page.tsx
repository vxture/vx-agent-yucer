import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import {
  getDeliveryStore,
  getPipelineStore,
} from "../../domains/shared/registry";
import { listRenewals } from "../../domains/delivery/service";
import { listRenewedProjectIds } from "../../domains/pipeline/service";
import { RenewalTable, type RenewalRow } from "../components/renewal-table";
import { openRenewal } from "./actions";
import { loadFailureText } from "../lib/load-failure";

// D7 -> D6: the subscriptions coming back round.
//
// The owner's ruling of 2026-08-30, and both halves are load-bearing: a renewal
// is derived FROM THE PROJECT (what was actually delivered, and when its term
// ends), and ONLY FOR SUBSCRIPTIONS (a one-off finished when it was handed
// over; proposing its renewal invents an obligation nobody took on).
//
// TWO DOMAINS COMPOSED HERE, not one reading the other. "Which projects already
// have a deal open off them" is D6's fact and D7 has no read of D6, so the page
// asks each domain its own question and passes the answer across - the same
// shape /routing uses to get an account's region into the router.
//
// THE PIPELINE READ FAILING IS NOT SURVIVABLE, and this is the one place the
// page is stricter than /routing. There, a missing territory read costs a
// suggestion. Here it costs the `already_renewed` check - so the page would
// propose opening a second live approach to a customer who already has one.
// A refusal is the better answer than a confident wrong one.

export const dynamic = "force-dynamic";

export default async function RenewalPage() {
  const { LOAD_ERROR, RENEWAL_TEXT, SHELL_TEXT } = await getMessages();
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

  const renewed = await listRenewedProjectIds({
    ...base,
    store: session.stores.pipeline(),
  });
  if (!renewed.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(renewed.violations, LOAD_ERROR)}
      />
    );
  }

  const candidates = await listRenewals(
    { ...base, store: getDeliveryStore() },
    renewed.value,
  );
  if (!candidates.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(candidates.violations, LOAD_ERROR)}
      />
    );
  }

  const rows: RenewalRow[] = candidates.value.map((c) => ({
    projectId: c.project.id,
    projectNo: c.project.projectNo,
    projectName: c.project.name,
    // From the project, not from the verdict. A renewal already open still has
    // a term running out, and reading the figure off the verdict made the
    // column say "no end date" for a project that has one.
    daysToEnd: c.daysToEnd,
    // The draft's amount, not the project's - they are the same number today,
    // and the draft is the one the rule layer stands behind.
    amount: c.draft?.amount ?? c.project.contractAmount?.amount ?? null,
    currency: c.project.currency,
    risk: c.verdict.kind === "due" ? c.verdict.risk : null,
    notDueReason: c.verdict.kind === "not_due" ? c.verdict.reason : null,
  }));

  return (
    <ViewLayout>
      <ViewHeader title={RENEWAL_TEXT.title} description={RENEWAL_TEXT.why} />
      <RenewalTable
        rows={rows}
        canOpen={
          can(
            session.authz,
            session.entitlement,
            "pipeline.opportunity.create",
            "ui",
          ).allowed
        }
        onOpen={openRenewal}
      />
    </ViewLayout>
  );
}
