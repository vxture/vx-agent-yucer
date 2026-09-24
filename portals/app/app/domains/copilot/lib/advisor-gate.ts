import type { Entitlement } from "../../../entitlement/types";
import type { FeatureKey } from "../../../entitlement/capability";
import { authorize, type Decision, type Surface } from "../../../authz/gate";
import type { PermissionHolder } from "../../../authz/decide";
import { CAPABILITY_SPEC, isCapability } from "./capability";

// The advisor's gate (YC-042 section 03, owner 2026-09-24: "参谋能力全面开放 -
// 只要功能有, 对应的参谋能力就有").
//
// An advisor capability follows its HOST feature key, not a tier of its own.
// A workspace that can use the deal pipeline gets the deal advisor, whatever
// tier it is on. The tier difference comes from the feature keys themselves
// and from the platform's quota pools, never from "is the advisor switched on".
//
// `copilot.suggest` survives with a narrower meaning: the SESSION tool loop,
// where a member asks the model to reach into the domain. A proposal with no
// capability came from that loop (or predates ADR-015), so it keeps the old
// gate - failing closed to the stricter key rather than open to the free one.
//
// The permission axis is unchanged: running an advisor or receiving its
// proposals needs copilot.use, deciding one needs copilot.decide. Both gates
// in the mandated order, through the one authorize() the whole product uses.

/** The feature key a proposal or advisor run is gated on. */
export function advisorFeature(capability: string | null): FeatureKey {
  return capability && isCapability(capability)
    ? CAPABILITY_SPEC[capability].feature
    : "copilot.suggest";
}

/** May this member run this advisor capability (and file what it proposes)? */
export function canRunAdvisor(
  holder: PermissionHolder,
  entitlement: Entitlement,
  capability: string | null,
  surface: Surface = "data",
): Decision {
  return canAdviseOn(holder, entitlement, advisorFeature(capability), surface);
}

/**
 * The same gate for an advisor output that files no proposal and so carries no
 * ADR-015 capability - a meeting brief is a synthesis a member reads, not a
 * proposal anyone decides. The caller names the feature the output belongs to.
 */
export function canAdviseOn(
  holder: PermissionHolder,
  entitlement: Entitlement,
  feature: FeatureKey,
  surface: Surface = "data",
): Decision {
  return authorize({
    entitlement,
    surface,
    feature,
    permission: "copilot.use",
    held: holder.permissions,
  });
}

/** May this member accept or reject a proposal this capability filed? */
export function canDecideProposal(
  holder: PermissionHolder,
  entitlement: Entitlement,
  capability: string | null,
  surface: Surface = "data",
): Decision {
  return authorize({
    entitlement,
    surface,
    feature: advisorFeature(capability),
    permission: "copilot.decide",
    held: holder.permissions,
  });
}
