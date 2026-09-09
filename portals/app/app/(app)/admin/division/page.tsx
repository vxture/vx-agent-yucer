import { EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { frameMembers, listCarves, listMarketDivisions, marketScope } from "../../../domains/account/service";
import { MarketScopeControl } from "../../components/market-scope-control";
import { DivisionPanel } from "../../components/division-panel";
import { DivisionImport } from "../../components/division-import";
import { NewEntryLink } from "../../components/form-page";
import { isSystemDivision, type MarketScope } from "../../../domains/shared/market-division";
import { frameName, frameNoun } from "../../lib/frame-copy";

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
// THE FRAME COMES FIRST (owner, 2026-09-09: 关键是这个范围定了，后面区域包含关系
// 就有了基础). Everything on this page is read inside it: the roster lists the
// frame's own carve, the coverage line counts against the frame's ground -
// 34 provinces, or 陕西's ten cities - and the noun in every sentence is the
// frame's word for what a region holds.
//
// THE GATE IS STILL planning.territory.*, deliberately. Who may re-carve the
// market is the same authority as who may redraw the territories on it, and
// inventing an admin.division permission to match the URL would add a
// permission that answers a question the catalogue already answers.

export const dynamic = "force-dynamic";

const CHINA: MarketScope = { kind: "china", code: null };

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
    store: session.stores.account(),
  };

  /* Read from the account store because that is where incr/0036 put the table,
     and gated on account.view - every roster that shows a customer's 大区 has
     to resolve one, so it is not a separate privilege. */
  const [divisions, scope, ground, carveRows] = await Promise.all([
    listMarketDivisions(ctx),
    marketScope(ctx),
    frameMembers(ctx),
    listCarves(ctx),
  ]);
  if (!divisions.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={PLANNING_TEXT.divisionEmptyWhy}
      />
    );
  }

  const frame = scope.ok ? scope.value : CHINA;
  const noun = frameNoun(frame, PLANNING_TEXT);
  // 预置方案, from the table (incr/0047) - only the carves of THIS frame.
  const carves = carveRows.ok ? carveRows.value : [];
  const rows = divisions.value;
  const placed = new Set(rows.flatMap((d) => d.members.map((m) => m.key)));
  // Counted off the frame's OWN ground - the same rows the picker offers - so a
  // member cannot be missing from this line and present in the drawer.
  const total = ground.ok ? ground.value : [];
  const unassigned = total.filter((m) => !placed.has(m.key));
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
        description={PLANNING_TEXT.divisionWhy(frameName(frame, PLANNING_TEXT), noun)}
        /* ONE SENTENCE, ONCE (owner, 2026-09-09): placed and regions, and the
           unplaced count only when there is one. The same figure used to
           close the table as well; a number said twice on one screen is a
           number the reader checks against itself. */
        secondary={
          <StatusBadge tone={unassigned.length === 0 ? "success" : "warning"}>
            {PLANNING_TEXT.divisionCoverage(placed.size, rows.length, unassigned.length, noun)}
          </StatusBadge>
        }
        /* BOTH ACTIONS IN THE PAGE HEADER'S SLOT (DS: 右侧动作区，通常是一到
           两个 Button). They were a row under the table; 新建 and 重置预置 are
           the two ways to change what the table says, and they belong where
           the DS puts a page's actions. */
        action={
          upsert ? (
            <>
              {/* THE FRAME IS A BUTTON THAT OPENS A PANEL (owner, 2026-09-09),
                  beside the two other ways to change what the roster says. A
                  display page states; configuration happens in what it opens. */}
              <MarketScopeControl scope={frame} editable={upsert} />
              <NewEntryLink href="/admin/division/new" label={PLANNING_TEXT.divisionNew} />
              <DivisionImport
                currentDivisions={rows.length}
                customCount={
                  rows.filter((d) => !isSystemDivision(carves, d.code, d.name, d.members.map((m) => m.key))).length
                }
                templates={carves.map((t) => ({
                  key: t.key,
                  label: t.name,
                  divisions: t.divisions.length,
                  names: t.divisions.map((d) => d.name),
                }))}
              />
            </>
          ) : null
        }
      />
      <DivisionPanel
        rows={rows.map((d) => ({
          id: d.id, code: d.code, name: d.name, sortOrder: d.sortOrder, members: d.members,
          system: isSystemDivision(carves, d.code, d.name, d.members.map((m) => m.key)),
        }))}
        unassigned={unassigned}
        noun={noun}
        // The same gate the write path enforces. A picker that appears and
        // then refuses is worse than one that is not offered.
        editable={upsert}
      />
    </ViewLayout>
  );
}
