import { EmptyState, PageSection } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { ACCOUNT_TEXT, SHELL_TEXT } from "../lib/messages";
import { getAccountStore } from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import { AccountTable } from "../components/account-table";

// D4 account list.
//
// Ordered sickest-first by the store, which is a product decision rather than a
// default: a customer list sorted by name is a directory, and a directory is
// not what a salesperson opens on a Monday. The unscored rows sort last -
// "never assessed" is not the same as "in trouble".

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listAccounts({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAccountStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <PageSection title={ACCOUNT_TEXT.title} description={ACCOUNT_TEXT.description}>
      <AccountTable rows={result.value} />
    </PageSection>
  );
}
