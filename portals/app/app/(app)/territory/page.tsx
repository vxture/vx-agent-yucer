import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getPlanningStore } from "../../domains/shared/registry";
import { listTerritories } from "../../domains/planning/service";
import { listMarketDivisions } from "../../domains/account/service";
import { ALL_PROVINCES } from "../../domains/shared/provinces";

import { DivisionPanel } from "../components/division-panel";
import { DivisionImport } from "../components/division-import";
import {
  DIVISION_TEMPLATES,
  isSystemDivision,
} from "../../domains/shared/market-division";
import { TerritoryPanel } from "../components/territory-panel";
import { loadFailureText } from "../lib/load-failure";
import { EntryActions, NewEntryLink } from "../components/form-page";

// D2 sales territories - a module page since 2026-08-30.
//
// It sat directly above the target table on /planning because a territory is a
// PRECONDITION for a regional target. That relationship is still true and is
// still stated there; what changed is that a menu entry now has a page rather
// than an anchor. Retired territories are included: a target may still name
// one, and hiding it would leave that target pointing at nothing.

export const dynamic = "force-dynamic";

export default async function TerritoryPage() {
  const { LOAD_ERROR, PLANNING_TEXT, SHELL_TEXT } = await getMessages();
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

  const territories = await listTerritories(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    { includeRetired: true },
  );

  if (!territories.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(territories.violations, LOAD_ERROR)}
      />
    );
  }

  /* 大区-省级. Read from the account store because that is where incr/0036
     put the table, and gated on account.view - every roster that shows a
     customer's 大区 has to resolve one, so it is not a separate privilege.
     A failed read is not fatal to this page: the territory roster above still
     answers its own question, so the section below simply does not render. */
  const divisions = await listMarketDivisions({ ...ctx, store: session.stores.account() });
  const divisionRows = divisions.ok ? divisions.value : [];
  const placed = new Set(divisionRows.flatMap((d) => d.provinces));
  // Computed from the SAME 34 the map and the database CHECK both use, so a
  // province cannot be missing from this list and present on the map.
  const unassigned = ALL_PROVINCES.filter((p) => !placed.has(p));

  const unowned = territories.value.filter((t) => !t.ownerSub).length;

  /* ONE READING OF THE WRITE GATE. It was evaluated three times, once per
     control, which is three chances for the doorways on one page to disagree
     about who may open them. */
  const upsert = can(
    session.authz, session.entitlement, "planning.territory.upsert", "ui",
  ).allowed;

  return (
    <ViewLayout>
      {/* NO FOLD: territories are a MAP, not a distribution - the useful
          reading is which regions are covered and by whom, and the panel below
          is exactly that. */}
      {/* Counted off the same array the panel draws, so the badge and the map
          under it cannot disagree. A territory with no owner covers ground
          nobody is answerable for - and 智能分配 refuses to place a lead into
          it, which is where that shows up. */}
      <ModuleHeadline
        moduleKey="territory"
        description={PLANNING_TEXT.territoryWhy}
        tags={
          <>
            <StatusBadge tone="success">
              {PLANNING_TEXT.tagTerritories(territories.value.length)}
            </StatusBadge>
            {unowned > 0 ? (
              <StatusBadge tone="warning">{PLANNING_TEXT.tagNoOwner(unowned)}</StatusBadge>
            ) : null}
          </>
        }
      />
      <TerritoryPanel rows={territories.value} />
      {/* THE DOORWAY SITS WITH THE ROSTER IT ADDS TO. All three actions used to
          be stacked in one row at the foot of the page, which asked the reader
          to remember which table each of them belonged to. */}
      {upsert ? (
        <EntryActions>
          {/* NO LABEL - the default 新建, the same word every other module
              page uses. territoryNew ("新建一个区域") is the form's own select
              option and reads as a sentence on a button. The row sits under
              the 销售区域 heading, so what it creates is not in doubt; the 大区
              row below names its subject because it holds two controls. */}
          <NewEntryLink href="/territory/new" />
        </EntryActions>
      ) : null}

      {divisions.ok ? (
        <DivisionPanel
          rows={divisionRows.map((d) => ({
            code: d.code, name: d.name, sortOrder: d.sortOrder, provinces: d.provinces,
            system: isSystemDivision(d.code, d.name, d.provinces),
          }))}
          unassigned={unassigned}
          // The same gate the write path enforces. A picker that appears and
          // then refuses is worse than one that is not offered.
          editable={upsert}
        />
      ) : null}
      {/* 重置预置 sits beside 新建大区 and not in a panel of its own: adopting a
          carve wholesale is one more way to decide what the table above says. */}
      {divisions.ok && upsert ? (
        <EntryActions>
          <NewEntryLink href="/territory/division/new" label={PLANNING_TEXT.divisionNew} />
          <DivisionImport
            currentDivisions={divisionRows.length}
            customCount={
              divisionRows.filter((d) => !isSystemDivision(d.code, d.name, d.provinces)).length
            }
            templates={DIVISION_TEMPLATES.map((t) => ({
              key: t.key,
              label: t.key === "five" ? PLANNING_TEXT.templateFive : PLANNING_TEXT.templateSeven,
              divisions: t.divisions.length,
              names: t.divisions.map((d) => d.name),
            }))}
          />
        </EntryActions>
      ) : null}
    </ViewLayout>
  );
}
