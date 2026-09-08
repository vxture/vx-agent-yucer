"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  importDivisionTemplate,
  removeMarketDivision as removeDivision,
  saveMarketDivision,
} from "../../domains/account/service";

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
export type SaveDivisionResult =
  | { ok: true; code: string; moved: { province: string; from: string }[] }
  | { ok: false; error: string };

/** Create or rename a 大区 and state which provinces it holds. */
export async function saveDivision(input: {
  code: string;
  name: string;
  provinces: string[];
}): Promise<SaveDivisionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await saveMarketDivision(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    input,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/territory");
  revalidatePath("/national");
  return { ok: true, code: result.value.code, moved: result.value.moved };
}

export type RemoveDivisionResult = { ok: true } | { ok: false; error: string };

export async function removeDivisionAction(code: string): Promise<RemoveDivisionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await removeDivision(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    code,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/territory");
  revalidatePath("/national");
  return { ok: true };
}

export type ImportTemplateResult =
  | { ok: true; divisions: number; replaced: number }
  | { ok: false; error: string };

/** Adopt a shipped carve (五分法 / 七分法) wholesale. */
export async function importTemplate(key: string): Promise<ImportTemplateResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await importDivisionTemplate(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    key,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/territory");
  revalidatePath("/national");
  return { ok: true, divisions: result.value.divisions, replaced: result.value.replaced };
}
