import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getAccountDetail } from "../../domains/account/service";
import { RecordFollowUp } from "../components/record-follow-up";
import { captureFollowUp } from "../account/field-actions";

// 完整录入 - ONE page for "what happened, and what was promised".
//
// THE CONSOLIDATION OF 2026-09-05. Before it, capture was scattered three
// ways: the deck's one-line dump (zero-friction, stays - it is ADR-012's whole
// bet), a full follow-up form that had drifted to ZERO mounts (a dead import
// on the account page; the deal page had dropped it for the deck), and a
// commitment form duplicated on BOTH detail pages, severed from the
// conversation the promise came out of - origin_interaction_id, in the schema
// since incr/0004 for exactly that link, had never once been set by the
// interface.
//
// Now: the dump stays where it is; everything richer converges HERE, one
// submission - the interaction and the promises made in it, linked. The
// commitment lists keep display and settle (a flow op, per the ruling) and
// their create buttons point at this page with context.
//
// CONTEXT ARRIVES BY URL (?account=..&opportunity=..&back=..) and the account
// is resolved server-side through its own gate - an id in the URL that the
// member cannot read renders the signed-out shape, not another tenant's name.

export const dynamic = "force-dynamic";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; opportunity?: string; back?: string }>;
}) {
  const { account: accountId, opportunity: opportunityId, back } = await searchParams;
  const { SHELL_TEXT, FIELD_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!accountId) {
    // A capture with no customer is the deck's job (an unanchored dump is
    // legal there); THIS page records against somebody. The account list is
    // where you pick who.
    redirect("/account");
  }
  if (!can(session.authz, session.entitlement, "account.interaction.record", "ui").allowed) {
    redirect(back && back.startsWith("/") ? back : "/account");
  }

  const detail = await getAccountDetail(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    accountId,
  );
  if (!detail.ok) {
    redirect("/account");
  }

  // `back` is untrusted URL input: only a same-app path may be a target.
  const doneHref = back && back.startsWith("/") ? back : `/account/${accountId}`;

  return (
    <ViewLayout>
      <ViewHeader
        title={FIELD_TEXT.captureTitle(detail.value.account.name)}
        description={FIELD_TEXT.captureWhy}
      />
      <RecordFollowUp
        accountId={accountId}
        opportunityId={opportunityId}
        canRecord
        onRecord={captureFollowUp}
        doneHref={doneHref}
      />
    </ViewLayout>
  );
}
