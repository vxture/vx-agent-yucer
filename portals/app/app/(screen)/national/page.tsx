import { EmptyState } from "@vxture/design-ui";
import { resolveAppSession } from "../../(app)/lib/session";
import { getMessages } from "../../(app)/lib/i18n/server";
import { can } from "../../authz/decide";
import { listAccounts } from "../../domains/account/service";
import { listPipeline } from "../../domains/pipeline/service";
import { listProjects } from "../../domains/delivery/service";
import { getDeliveryStore } from "../../domains/shared/registry";
import { rollUpByProvince } from "../lib/rollup";
import { NationalScreen } from "../components/national-screen";

// 全国销售态势屏 - the situation screen, as a page of this product.
//
// THE GATE IS THE SUM OF THE PAGES IT AGGREGATES, and that is the whole design.
// This screen shows customers, deals and delivery money on one surface; a reader
// who may see the pipeline but not delivery must not learn delivery totals here
// just because they are rolled up. So it asks for all three of the view actions
// that own those figures - account.view, pipeline.view, delivery.project.view -
// and refuses unless every one allows.
//
// NO NEW FEATURE KEY, deliberately. Keys are frozen at 19 (owner, 2026-08-26)
// and this is not separately sellable: it is a way of looking at data the
// workspace already has. Requiring the three existing actions also means the
// screen inherits their ENTITLEMENT gates for free - a workspace whose tier does
// not include delivery cannot see delivery figures on the map either, without a
// single line here knowing what a tier is.
//
// "ui" SURFACE. This is a page render deciding what to draw, not an API serving
// data - the distinction the action catalogue keeps out of the specs on purpose.

export const dynamic = "force-dynamic";

export default async function NationalScreenPage() {
  const { SHELL_TEXT, SCREEN_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = { holder: session.authz, entitlement: session.entitlement };
  const gates = [
    can(ctx.holder, ctx.entitlement, "account.view", "ui"),
    can(ctx.holder, ctx.entitlement, "pipeline.view", "ui"),
    can(ctx.holder, ctx.entitlement, "delivery.project.view", "ui"),
  ];
  const denied = gates.find((g) => !g.allowed);
  if (denied) {
    // ONE REFUSAL, NOT A PARTIAL SCREEN. Rendering the map with delivery blanked
    // out would be a national screen that quietly under-reports, which is worse
    // than a screen that says it cannot be shown.
    return (
      <EmptyState
        title={SCREEN_TEXT.deniedTitle}
        description={SCREEN_TEXT.deniedDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  /* THE STORES COME OFF THE SESSION, already scoped. Reaching for the registry's
     own getters here would step past the reader's data scope - a national screen
     is exactly where that would be least visible, because a member narrowed to
     one territory would see a whole country and have no way to tell. Delivery
     carries no owner column and so has no scoped wrapper; it takes the registry
     getter like /delivery does. */
  const [accounts, deals, projects] = await Promise.all([
    listAccounts({ ...base, store: session.stores.account() }),
    listPipeline({ ...base, store: session.stores.pipeline() }, { includeClosed: true }),
    listProjects({ ...base, store: getDeliveryStore() }),
  ]);

  const rollup = rollUpByProvince(
    accounts.ok ? accounts.value : [],
    deals.ok ? deals.value : [],
    projects.ok ? projects.value : [],
  );

  return (
    /* THE SUB, not a display name. AuthUser carries no name - the same reason
       the account table renders a monospaced id in its owner column until a
       directory lands. Dressing an id up as a person is the defect that page
       already fixed once. */
    <NationalScreen rollup={rollup} viewerSub={session.user.sub} />
  );
}
