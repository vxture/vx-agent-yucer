import Link from "next/link";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { PageCrumbs } from "../../components/page-crumbs";
import { ViewHeader } from "../../components/business-controls";
import { PageActionButton } from "../../components/page-header-actions";
import { ContactDetails } from "../../components/contact-details";
import { readContactView } from "../../../domains/account/contact-read";
import { can } from "../../../authz/decide";

export const dynamic = "force-dynamic";
export default async function ContactDetailPage({ params, searchParams }: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ account?: string }> }>) {
  const session = await resolveAppSession();
  if (!session) return null;
  const { CONTACT_VIEW_TEXT: T, DOMAIN_LABEL } = await getMessages();
  const { id } = await params, { account } = await searchParams;
  if (!account) return <EmptyState title={T.unavailable}/>;
  try {
    const result = await readContactView({ workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: session.stores.account() }, account, id);
    if (!result.ok) return <EmptyState title={T.unavailable}/>;
    const accountHref = `/account/${encodeURIComponent(account)}`;
    const currentHref = `/contact/${encodeURIComponent(id)}?account=${encodeURIComponent(account)}`;
    const editHref = `/contact/new?account=${encodeURIComponent(account)}&edit=${encodeURIComponent(id)}&back=${encodeURIComponent(currentHref)}`;
    return <ViewLayout><PageCrumbs trail={[{ label: DOMAIN_LABEL.account, href: "/account" }, { label: result.value.accountName, href: accountHref }]} current={result.value.contact.name}/>
      <ViewHeader title={result.value.contact.name} icon="user" divider pageActions={{ secondary: <PageActionButton asChild><Link href={accountHref}>{T.openAccount}</Link></PageActionButton>, primary: can(session.authz, session.entitlement, "account.contact.upsert", "ui").allowed ? <PageActionButton intent="primary" asChild><Link href={editHref}>{T.edit}</Link></PageActionButton> : undefined }}/>
      <ContactDetails accountId={account} {...result.value}/>
    </ViewLayout>;
  } catch { return <EmptyState title={T.unavailable}/>; }
}
