import { getAuthzStore, type AuthzStore } from "../authz/store";

// The product's own list of workspaces to run recurring jobs for (ADR-033).
// A workspace is "active" once it has had a member - the row every real
// workspace acquires at its first login - which is also the criterion the
// org-structure seeding uses. The provisioning ledger (vx_provision.app_instance)
// is the platform's view and is not consulted here: it is empty until the
// platform's first webhook delivery, and a job that waited for it would never
// have swept the workspaces people are already working in.
export async function listActiveWorkspaces(store: AuthzStore = getAuthzStore()): Promise<string[]> {
  return store.listWorkspaces();
}
