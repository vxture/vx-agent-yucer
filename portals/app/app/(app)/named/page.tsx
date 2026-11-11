import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getDeliveryStore } from "../../domains/shared/registry";
import { accountStatuses, importanceScheme, listAccounts } from "../../domains/account/service";
import { accountLevelBadges } from "../../domains/account/lib/importance";
import { NamedAccountActions } from "../components/named-account-actions";
import { AccountTable } from "../components/account-table";
import { loadFailureText } from "../lib/load-failure";

// Named accounts reuse the customer master and its shared creation/designation flows.

export const dynamic = "force-dynamic";

export default async function NamedAccountPage() {
  const { LOAD_ERROR, NAMED_ACCOUNT_TEXT, SHELL_TEXT } =
    await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const result = await listAccounts({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
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

  // 客户级别 badges, from the same scheme as the customer page.
  const scheme = await importanceScheme({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  });

  const levelOf = scheme.ok ? accountLevelBadges(result.value, scheme.value.account) : undefined;

  // 状态标签, derived (YC-021 L5) - see account/page.tsx.
  const statusRead = await accountStatuses(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
      pipeline: session.stores.pipeline(),
      delivery: getDeliveryStore(),
    },
    named.map((a) => a.id),
  ).catch(() => null);

  return (
    <ViewLayout>
      {/* NO FOLD: this list IS a filter of the customer roster - one bucket
          by construction, so there is nothing to break into shares. */}
      <ModuleHeadline
        moduleKey="namedAccount"
        brief="named"
        tags={<StatusBadge tone="success">{NAMED_ACCOUNT_TEXT.tagNamed(named.length)}</StatusBadge>}
        action={can(session.authz, session.entitlement, "account.upsert", "ui").allowed ? <NamedAccountActions accounts={result.value.map(({ id, name, accountNo, tier, ownerSub }) => ({ id, name, accountNo, tier, ownerSub, levelName: levelOf?.get(id)?.name }))} /> : undefined}
      />
      {named.length === 0 ? <EmptyState title={NAMED_ACCOUNT_TEXT.none} description={NAMED_ACCOUNT_TEXT.noneWhy} /> : <AccountTable
        rows={named}
        levelOf={levelOf}
        statusOf={statusRead?.ok ? statusRead.value : null}
        canRecompute={
          can(session.authz, session.entitlement, "account.upsert", "ui")
            .allowed
        }
      />}
    </ViewLayout>
  );
}
