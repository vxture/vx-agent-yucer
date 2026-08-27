"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCatalogStore } from "../../domains/shared/registry";
import { setPrice, upsertProduct, upsertSolution } from "../../domains/catalog/service";

// Catalogue writes.
//
// Three actions for three permissions, kept apart at this layer too. Folding
// them into one `saveCatalogue(kind, payload)` would have made the split a
// runtime branch instead of three call sites a reader can count - and the
// split is the whole design: whoever moves the floor approves every discount in
// the product without approving anything.

export interface CatalogResult {
  ok: boolean;
  error?: string;
}

async function context() {
  const session = await resolveAppSession();
  if (!session) return null;
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCatalogStore(),
  };
}

export async function saveProduct(input: {
  productCode: string;
  name: string;
  category: string | null;
  unit: string;
}): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await upsertProduct(ctx, input);
  // THE CODE, NOT THE PROSE. A violation's `message` is written for the rule
  // layer's own reader and is in English; passing it to the interface is
  // TD-010, and this file added a fresh instance of that debt before this line
  // existed - "a floor above list price would make every sale need approval"
  // rendered verbatim inside a Chinese page. The code is a key; the sentence
  // belongs to the dictionary.
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  return { ok: true };
}

export async function saveSolution(input: {
  solutionCode: string;
  name: string;
  summary: string | null;
  items: readonly { productId: string; quantity: number }[];
}): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await upsertSolution(ctx, input);
  // THE CODE, NOT THE PROSE. A violation's `message` is written for the rule
  // layer's own reader and is in English; passing it to the interface is
  // TD-010, and this file added a fresh instance of that debt before this line
  // existed - "a floor above list price would make every sale need approval"
  // rendered verbatim inside a Chinese page. The code is a key; the sentence
  // belongs to the dictionary.
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  return { ok: true };
}

export async function savePrice(input: {
  productId: string;
  currency: string;
  listPrice: number;
  floorPrice: number;
}): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await setPrice(ctx, input);
  // THE CODE, NOT THE PROSE. A violation's `message` is written for the rule
  // layer's own reader and is in English; passing it to the interface is
  // TD-010, and this file added a fresh instance of that debt before this line
  // existed - "a floor above list price would make every sale need approval"
  // rendered verbatim inside a Chinese page. The code is a key; the sentence
  // belongs to the dictionary.
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  return { ok: true };
}
