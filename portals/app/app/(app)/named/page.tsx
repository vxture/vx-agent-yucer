import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getAccountStore } from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import { AccountTable } from "../components/account-table";
import { loadFailureText } from "../lib/load-failure";

// D2 named accounts - the roster the write path never had.
//
// designateAccountTier shipped in 6c and lives on /account/[id]: it marks one
// account strategic or key and attaches the plan the cadence rule reads. What
// never existed was the ROSTER - who our named accounts ARE, together - and a
// control on a detail page is not a surface. You could set the tier on an
// account you had already found; you could not ask which accounts hold one.
//
// READ ONLY, deliberately. The tier is set where the evidence for setting it
// is - the account's own page, beside its health, its chain and its deals.
// A tier control on a list would invite ranking customers from a table, which
// is the decision ADR-013 wants made in front of the account.
//
// Standard accounts are absent rather than greyed: this is the roster of the
// named ones, and a list mostly full of unnamed accounts would be /account
// with a column added.

export const dynamic = "force-dynamic";

export default async function NamedAccountPage() {
  const { SHELL_TEXT, LOAD_ERROR, NAMED_ACCOUNT_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
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
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // Strategic first, then key: the order is the commitment, and sorting by
  // name would bury the accounts that carry the heaviest cadence.
  const RANK: Record<string, number> = { strategic: 0, key: 1 };
  const named = result.value
    .filter((a) => a.tier !== "standard")
    .sort((a, b) => (RANK[a.tier] ?? 9) - (RANK[b.tier] ?? 9));

  if (named.length === 0) {
    return (
      <ViewLayout>
        <EmptyState
          title={NAMED_ACCOUNT_TEXT.none}
          description={NAMED_ACCOUNT_TEXT.noneWhy}
        />
      </ViewLayout>
    );
  }

  return (
    <ViewLayout>
      <AccountTable
        rows={named}
        canRecompute={
          can(session.authz, session.entitlement, "account.upsert", "ui").allowed
        }
      />
    </ViewLayout>
  );
}
