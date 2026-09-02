"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { fillAccountField } from "../../../domains/account/service";

// Batch apply. Each row is still fillAccountField() gated and written one at a
// time on the accepter's own permissions - the same write completeness-action's
// single fillField() performs, just looped. There is no bulk-write verb: a
// batch that wrote through one call with N rows would be a second, unaudited
// path into the same columns the single-fill path already covers.
//
// A PARTIAL RESULT IS EXPECTED, NOT AN ERROR. The selection was read from a
// page render that can be stale by the time this runs - another member filled
// the same field, or the account was reassigned out of this member's scope.
// Each row's own outcome is reported rather than the batch failing whole.

export interface BatchFillItem {
  accountId: string;
  field: string;
  value: string;
}

export interface BatchFillResult {
  applied: number;
  failed: ReadonlyArray<{ accountId: string; field: string; error: string }>;
}

export async function applyBatchFill(items: readonly BatchFillItem[]): Promise<BatchFillResult> {
  const session = await resolveAppSession();
  if (!session) {
    return {
      applied: 0,
      failed: items.map((i) => ({ accountId: i.accountId, field: i.field, error: "not_authenticated" })),
    };
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };

  let applied = 0;
  const failed: Array<{ accountId: string; field: string; error: string }> = [];
  for (const item of items) {
    const result = await fillAccountField(ctx, item.accountId, item.field, item.value);
    if (result.ok) applied += 1;
    else failed.push({ accountId: item.accountId, field: item.field, error: result.violations[0]?.code ?? "denied" });
  }

  if (applied > 0) {
    // Region changes which territory covers a customer, which decides who can
    // see it - the same reason completeness-action.ts revalidates the whole
    // layout rather than one path.
    revalidatePath("/", "layout");
  }
  return { applied, failed };
}
