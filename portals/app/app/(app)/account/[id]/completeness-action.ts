"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { fillAccountField } from "../../../domains/account/service";

// One-click fill.
//
// The owner's ask of 2026-09-01. What makes it one click rather than a form is
// that the value was already worked out - either read from this workspace's own
// rows, or proposed by the model and accepted in the copilot queue. This action
// is only the write.
//
// THE FIELD AND VALUE COME FROM THE CLIENT and are checked on the server
// anyway, twice: a client that can name a field can name the wrong one, and
// this one writes to a customer record.

export interface FillResult {
  ok: boolean;
  error?: string;
}

export async function fillField(
  accountId: string,
  field: string,
  value: string,
): Promise<FillResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await fillAccountField(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    accountId,
    field,
    value,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  // The region decides which territory covers this customer, which decides who
  // can see it - so a fill can change what every list returns.
  revalidatePath("/", "layout");
  return { ok: true };
}
