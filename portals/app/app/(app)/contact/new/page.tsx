import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAccountDetail } from "../../../domains/account/service";
import { PersonForm } from "../../components/person-form";
import { saveContact } from "../../account/actions";

// 新建/编辑联系人 - a page since 2026-09-05 (the consolidation ruling; see
// /catalog/new for the shape and why the gate redirects). The roster on the
// account page is display-only now and points here with its account in the
// URL; the account resolves server-side through its own gate.

export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; back?: string }>;
}) {
  const { account: accountId, back } = await searchParams;
  const { SHELL_TEXT, ACCOUNT_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!accountId) redirect("/account");
  if (!can(session.authz, session.entitlement, "account.contact.upsert", "ui").allowed) {
    redirect(`/account/${accountId}`);
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
  if (!detail.ok) redirect("/account");

  const doneHref = back && back.startsWith("/") ? back : `/account/${accountId}`;

  return (
    <ViewLayout>
      <ViewHeader
        title={ACCOUNT_TEXT.contactFormTitle(detail.value.account.name)}
        description={ACCOUNT_TEXT.contactFormWhy}
      />
      <PersonForm
        accountId={accountId}
        rows={detail.value.contacts}
        statusLabel={ACCOUNT_TEXT.contactStatusLabel}
        doneHref={doneHref}
        onSave={saveContact}
      />
    </ViewLayout>
  );
}
