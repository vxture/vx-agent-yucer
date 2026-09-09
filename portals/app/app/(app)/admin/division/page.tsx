import { EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { listMarketDivisions, marketScope } from "../../../domains/account/service";
import { MarketScopeControl } from "../../components/market-scope-control";
import { ALL_PROVINCES } from "../../../domains/shared/provinces";
import { DivisionPanel } from "../../components/division-panel";
import { DivisionImport } from "../../components/division-import";
import { NewEntryLink } from "../../components/form-page";
import {
  DIVISION_TEMPLATES,
  isSystemDivision,
} from "../../../domains/shared/market-division";

// 市场划分 (大区) - CONFIGURATION, not a business module (owner, 2026-09-08).
//
// It used to be half of /territory, beside the sales territories, and the two
// halves kept being read as one thing. They are two dimensions: a 大区 is how
// the market is CARVED - every province in exactly one, changed rarely, and
// every figure the situation screen groups depends on it - while a 区域 is a
// TEAM working that ground, with an owner and a number, which is planning and
// now lives on /planning.
//
// So this is workspace configuration and it sits where configuration sits:
// behind the gear, beside members and adoption. A table that is set once and
// read by everything is not something a seller opens on a Monday.
//
// THE GATE IS STILL planning.territory.*, deliberately. Who may re-carve the
// market is the same authority as who may redraw the territories on it, and
// inventing an admin.division permission to match the URL would add a
// permission that answers a question the catalogue already answers.

export const dynamic = "force-dynamic";

export default async function DivisionPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, PLANNING_TEXT, SHELL_TEXT } = await getMessages();
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
  };

  /* Read from the account store because that is where incr/0036 put the table,
     and gated on account.view - every roster that shows a customer's 大区 has
     to resolve one, so it is not a separate privilege. */
  const [divisions, scope] = await Promise.all([
    listMarketDivisions({ ...ctx, store: session.stores.account() }),
    marketScope({ ...ctx, store: session.stores.account() }),
  ]);
  if (!divisions.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={PLANNING_TEXT.divisionEmptyWhy}
      />
    );
  }

  const rows = divisions.value;
  const placed = new Set(rows.flatMap((d) => d.provinces));
  // Computed from the SAME 34 the map and the database CHECK both use, so a
  // province cannot be missing from this list and present on the map.
  const unassigned = ALL_PROVINCES.filter((p) => !placed.has(p));
  const upsert = can(
    session.authz, session.entitlement, "planning.territory.upsert", "ui",
  ).allowed;

  return (
    <ViewLayout>
      {/* ViewHeader rather than ModuleHeadline, for the reason /admin gives:
          moduleIcon() resolves icons for MODULES, and this is not one. */}
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.division}
      />
      <ViewHeader
        icon="map-pin"
        title={DOMAIN_LABEL.division}
        description={PLANNING_TEXT.divisionWhy}
        secondary={
          <StatusBadge tone={unassigned.length === 0 ? "success" : "warning"}>
            {PLANNING_TEXT.divisionCoverage(placed.size, ALL_PROVINCES.length, rows.length)}
          </StatusBadge>
        }
        /* BOTH ACTIONS IN THE PAGE HEADER'S SLOT (DS: 右侧动作区，通常是一到
           两个 Button). They were a row under the table; 新建 and 重置预置 are
           the two ways to change what the table says, and they belong where
           the DS puts a page's actions. */
        action={
          upsert ? (
            <>
              <NewEntryLink href="/admin/division/new" label={PLANNING_TEXT.divisionNew} />
              <DivisionImport
                currentDivisions={rows.length}
                customCount={
                  rows.filter((d) => !isSystemDivision(d.code, d.name, d.provinces)).length
                }
                templates={DIVISION_TEMPLATES.map((t) => ({
                  key: t.key,
                  label: t.key === "five" ? PLANNING_TEXT.templateFive : PLANNING_TEXT.templateSeven,
                  divisions: t.divisions.length,
                  names: t.divisions.map((d) => d.name),
                }))}
              />
            </>
          ) : null
        }
      />
      {/* THE FRAME FIRST (owner, 2026-09-09): the roster is a list of regions
          carved inside it, so it is read before the roster. */}
      <MarketScopeControl
        scope={scope.ok ? scope.value : { kind: "china", code: null }}
        editable={upsert}
      />
      <DivisionPanel
        rows={rows.map((d) => ({
          code: d.code, name: d.name, sortOrder: d.sortOrder, provinces: d.provinces,
          system: isSystemDivision(d.code, d.name, d.provinces),
        }))}
        unassigned={unassigned}
        total={ALL_PROVINCES.length}
        // The same gate the write path enforces. A picker that appears and
        // then refuses is worse than one that is not offered.
        editable={upsert}
      />
    </ViewLayout>
  );
}
