import { pricingUrl } from "../../entitlement/deeplink";
import type { AppSession } from "../lib/session";
import { upgradeTarget } from "../lib/upgrade";
import { UpgradePage } from "./upgrade-page";

/**
 * The upgrade template IN PLACE of a module page this workspace has not
 * bought, or null when the member may open it (owner 2026-09-28: a locked
 * module's own address lands on the same page as its launcher row, not on
 * 加载失败). Called first by each tier-gated page: the shell's layout
 * persists across in-app navigation, so the check has to be the page's own.
 */
export function lockedPage(session: AppSession, moduleKey: string) {
  const target = upgradeTarget(moduleKey, session.authz, session.entitlement);
  return target ? (
    <UpgradePage target={target} pricingHref={pricingUrl()} canUpgrade={session.authz.isWorkspaceOwner} />
  ) : null;
}
