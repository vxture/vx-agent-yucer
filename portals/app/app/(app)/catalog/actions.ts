"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCatalogStore } from "../../domains/shared/registry";
import {
  moveProduct,
  moveProductStatus,
  moveProductType,
  removeProduct,
  removeProductStatus,
  removeProductType,
  saveProductStatus,
  setPrice,
  setProductStatus,
  upsertProduct,
  upsertProductType,
  upsertSolution,
} from "../../domains/catalog/service";

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
  typeId: string | null;
  unit: string;
  /** A status row's uuid. Only the create form sends this; an edit omits it
   * and keeps the row's status - transitions belong to the row operations. */
  statusId?: string;
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

// --- the module page's row operations (owner ruling 2026-09-05) --------------

export async function changeProductStatus(
  productId: string,
  statusId: string,
): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await setProductStatus(ctx, { productId, statusId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  return { ok: true };
}

export async function moveProductRow(
  productId: string,
  direction: "up" | "down",
): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await moveProduct(ctx, { productId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/new");
  return { ok: true };
}

export async function deleteProduct(productId: string): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await removeProduct(ctx, { productId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  return { ok: true };
}

// --- the config page: the type vocabulary ------------------------------------

export async function saveProductType(input: {
  typeCode: string;
  name: string;
  status?: "active" | "retired";
}): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await upsertProductType(ctx, input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  return { ok: true };
}

export async function moveProductTypeRow(
  typeId: string,
  direction: "up" | "down",
): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await moveProductType(ctx, { typeId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  return { ok: true };
}

export async function deleteProductType(typeId: string): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await removeProductType(ctx, { typeId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  return { ok: true };
}

// --- the config page: the status vocabulary ----------------------------------

export async function saveStatusRow(input: {
  statusCode: string;
  name: string;
  description?: string | null;
}): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await saveProductStatus(ctx, input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  revalidatePath("/catalog/new");
  return { ok: true };
}

export async function deleteStatusRow(statusId: string): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await removeProductStatus(ctx, { statusId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  revalidatePath("/catalog/new");
  return { ok: true };
}

export async function moveStatusRow(
  statusId: string,
  direction: "up" | "down",
): Promise<CatalogResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const r = await moveProductStatus(ctx, { statusId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/catalog");
  revalidatePath("/catalog/settings");
  return { ok: true };
}
