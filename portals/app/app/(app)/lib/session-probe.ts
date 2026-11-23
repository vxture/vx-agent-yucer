import type { ProductEntryState } from "../../auth/product-access";
import { sessionIdentityKey, type SessionIdentity } from "./session-identity";
export type SessionProbeDecision = "ready" | "ended" | "unavailable" | "reloading";

function validIdentity(value: unknown): value is SessionIdentity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.sub === "string" && !!v.sub && (v.activeOrg === null || typeof v.activeOrg === "string")
    && (v.activeWorkspace === null || typeof v.activeWorkspace === "string")
    && (v.roles === undefined || Array.isArray(v.roles) && v.roles.every(role => typeof role === "string"));
}
/** A confirmed identity change discards old work even if new access is unknown. */
export function sessionProbeDecision(identityKey: string, initial: ProductEntryState, revision: string | undefined, body: unknown, ok = true): SessionProbeDecision {
  if (!ok || !body || typeof body !== "object") return "unavailable";
  const value = body as Record<string, unknown>;
  if (value.authenticated === false) return "ended";
  if (value.authenticated !== true || !validIdentity(value.user)) return "unavailable";
  if (identityKey !== sessionIdentityKey(value.user)) return "reloading";
  if (!["ready", "unassigned", "no-roles", "no-subscription"].includes(String(value.productAccess))) return "unavailable";
  return value.productAccess !== initial || revision && value.accessRevision !== revision ? "reloading" : "ready";
}
