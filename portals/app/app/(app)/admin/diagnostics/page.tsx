import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { runPlatformCheck } from "../../../api/platform-check/check";
import { DiagnosticsPanel } from "../../components/diagnostics-panel";

// 系统验证 (owner, 2026-09-17): "主要放与平台的对接验证，C1 C2 C3。可以主动
// 推送和触发数据，否则平台不知道产品是不是好的". The nine probes already
// existed (app/api/platform-check/check.ts, built for the L1 conformance
// checklist) and already had one active/spending trigger (the C3 replay
// probe) - what did not exist was a permissioned, in-app place to see them
// and a button for the one trigger. This does not replace
// /(demo)/platform-check: that bootstrap page has to render even when the
// app shell itself is broken, which is a different failure mode from "an
// admin wants to check platform health while signed in". Both call the same
// underlying check.ts - one engine, two front ends.
//
// BUILT AS SECTIONS, not one flat list (owner: "预留其他系统验证可扩展") -
// 平台对接 (C1/C2/C3) is the first and only section today; DiagnosticsPanel
// takes a `sections` array so a second kind of system verification is a new
// section, not a page redesign.
//
// GATED ON admin.diagnostics.view for the page itself; the replay probe's
// button is additionally gated on admin.diagnostics.probe (passed down as
// `canProbe`) because it spends a real yucer.copilot.turns unit against the
// workspace's quota - seeing this page does not imply may-spend-against-it.

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const { ADMIN_TEXT, DIAGNOSTICS_TEXT, DOMAIN_LABEL } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.
  if (!can(session.authz, session.entitlement, "admin.diagnostics.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const canProbe = can(session.authz, session.entitlement, "admin.diagnostics.probe", "data").allowed;
  const check = await runPlatformCheck(session.workspaceId);

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.diagnostics}
      />
      <ViewHeader
        icon="plugs-connected"
        title={DIAGNOSTICS_TEXT.title}
        description={DIAGNOSTICS_TEXT.description}
      />
      <DiagnosticsPanel initialCheck={check} canProbe={canProbe} />
    </ViewLayout>
  );
}
