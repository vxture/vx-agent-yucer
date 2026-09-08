"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { moveProvinceToDivision } from "../../domains/account/service";

/* 大区-省级 的写入路径.
 *
 * The read side has existed since incr/0036 and the situation screen has been
 * grouping by it; what was missing was any way for a workspace to change it.
 * Renaming or re-carving a 大区 was a column grant and nothing more - a data
 * capability, not a product one.
 *
 * Returns the violation CODE, never its sentence: the rule layer writes its
 * messages for its own reader, and the interface looks the code up in the
 * message dictionary (TD-010).
 */
export type MoveProvinceResult =
  | { ok: true; province: string; divisionCode: string | null }
  | { ok: false; error: string };

export async function moveProvince(input: {
  province: string;
  /** null takes the province out of every 大区. */
  divisionCode: string | null;
}): Promise<MoveProvinceResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await moveProvinceToDivision(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      // The SCOPED store, like every other caller. A division is workspace
      // configuration and is not narrowed by it, but reaching past the session
      // for an unscoped store here would be the habit that eventually does.
      store: session.stores.account(),
    },
    input.province,
    input.divisionCode,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  // Both surfaces that read the division: this page, and the screen's map.
  revalidatePath("/territory");
  revalidatePath("/national");
  return { ok: true, province: input.province, divisionCode: input.divisionCode };
}
