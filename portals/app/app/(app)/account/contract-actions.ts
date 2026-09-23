"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getDeliveryStore } from "../../domains/shared/registry";
import {
  removeContractLine,
  upsertContract,
  upsertContractLine,
} from "../../domains/delivery/service";
import { CONTRACT_STATUSES, type ContractStatus } from "../../domains/delivery/lib/contract";

// 合同 tab writes (incr/0076, L4 batch one).
//
// D7's verbs, reached from the account page - the page decides where the
// button sits, the delivery gate decides whether it works (R1/R2). Dates arrive
// as `yyyy-mm-dd` and are parsed HERE, on the server, for the reason
// delivery/actions.ts gives: a bad string must be refused where the rule
// lives, not become an Invalid Date the phase derivation then reads.
//
// The CODE crosses back, never the prose (TD-010).

export interface ContractActionResult {
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
    store: getDeliveryStore(),
  };
}

function day(v: string | null): Date | null | "bad" {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

export async function saveContract(input: {
  contractId: string | null;
  accountId: string;
  contractNo: string;
  name: string;
  opportunityId: string | null;
  status: string;
  totalAmount: number | null;
  currency: string;
  termStart: string | null;
  termEnd: string | null;
  noticeDays: number;
  signedAt: string | null;
}): Promise<ContractActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  if (!(CONTRACT_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "unknown_status" };
  }
  const termStart = day(input.termStart);
  const termEnd = day(input.termEnd);
  const signedAt = day(input.signedAt);
  if (termStart === "bad" || termEnd === "bad" || signedAt === "bad") {
    return { ok: false, error: "invalid_date" };
  }

  const result = await upsertContract(
    ctx,
    {
      contractNo: input.contractNo,
      name: input.name,
      accountId: input.accountId,
      opportunityId: input.opportunityId,
      status: input.status as ContractStatus,
      totalAmount: input.totalAmount,
      currency: input.currency,
      termStart,
      termEnd,
      noticeDays: input.noticeDays,
      signedAt,
    },
    input.contractId ?? undefined,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${input.accountId}`);
  return { ok: true };
}

export async function saveContractLine(input: {
  accountId: string;
  contractId: string;
  lineId: string | null;
  productId: string;
  quantity: number;
  unitPrice: number;
  termEnd: string | null;
}): Promise<ContractActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const termEnd = day(input.termEnd);
  if (termEnd === "bad") return { ok: false, error: "invalid_date" };

  const result = await upsertContractLine(
    ctx,
    input.contractId,
    { productId: input.productId, quantity: input.quantity, unitPrice: input.unitPrice, termEnd },
    input.lineId ?? undefined,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${input.accountId}`);
  return { ok: true };
}

export async function deleteContractLine(input: {
  accountId: string;
  contractId: string;
  lineId: string;
}): Promise<ContractActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "not_authenticated" };
  const result = await removeContractLine(ctx, input.contractId, input.lineId);
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${input.accountId}`);
  return { ok: true };
}
