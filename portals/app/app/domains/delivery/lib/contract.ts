import { toMinor, fromMinor } from "../../shared/money";
import { allOf, fail, violation, type RuleResult, type Violation } from "../../shared/result";

// 合同与已购态 - the L4 ground floor (incr/0076, business rules §9.2).
//
// Pure functions only. Three things are decided here and nowhere else:
//
//   1. What a contract may say about itself (planContract): the term is a
//      window, the notice period is a term of the agreement, and the keys that
//      record HOW the contract came to exist - its number, its customer, the
//      deal that produced it - are fixed once written. The column locks refuse
//      the same edit at the database; this refuses it first, with a code.
//   2. What a line may say (planContractLine): quantity positive, price not
//      negative, the contract's own currency, and never outliving the contract.
//      `amount` is computed here, in minor units, never taken from the form.
//   3. What the customer is running NOW (ownedProducts, §9.2): the unexpired
//      lines of in-force contracts. Not every line ever signed - a terminated
//      contract, a lapsed term or a line that stopped early all drop out, or a
//      customer who dropped a module keeps "owning" it forever and 白地 (batch
//      six) can never contain it again.
//
// NO STORED EXPIRY. `contractPhase` derives lapsed/pending from the term every
// time it is asked, for the reason incr/0076 gives: a stored `expired` needs a
// job to flip it, and a row nobody flipped is a lie that reads like a fact.

export const CONTRACT_STATUSES = ["draft", "active", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ContractDraft {
  contractNo: string;
  name: string;
  accountId: string;
  opportunityId: string | null;
  /** The signed value. Nullable in the DDL: a draft may not know it yet. */
  totalAmount: number | null;
  currency: string;
  termStart: Date | null;
  termEnd: Date | null;
  noticeDays: number;
  status: ContractStatus;
  signedAt: Date | null;
}

export interface ContractLineDraft {
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Null runs as long as the contract does - the ordinary case. */
  termEnd: Date | null;
}

/** A line as planned: the draft plus what the rule computed from it. */
export interface PlannedContractLine extends ContractLineDraft {
  amount: number;
  currency: string;
}

/** The slice of a stored contract the rules read. */
export interface ContractFacts {
  id: string;
  contractNo: string;
  accountId: string;
  opportunityId: string | null;
  status: ContractStatus;
  currency: string;
  termStart: Date | null;
  termEnd: Date | null;
}

export interface ContractLineFacts {
  id: string;
  productId: string;
  quantity: number;
  termEnd: Date | null;
}

const NO_MAX = 64;
const NAME_MAX = 255;
const DAY_MS = 86_400_000;

/**
 * Validate a contract create or edit.
 *
 * `held` is the stored row when this is an edit (by id), null on a create.
 * CREATE AND EDIT ARE SEPARATE, not an upsert by contract number: a number
 * typed twice would otherwise quietly edit somebody else's contract. The
 * service refuses a taken number on create (`contract_no_taken`); here an
 * edit may not change it.
 */
export function planContract(
  input: ContractDraft,
  held: ContractFacts | null,
): RuleResult<ContractDraft> {
  const contractNo = input.contractNo.trim();
  const name = input.name.trim();
  const plan: ContractDraft = { ...input, contractNo, name, currency: input.currency.trim() || "CNY" };

  const checks: Array<Violation | null> = [
    contractNo === ""
      ? violation("contract_no_required", "a contract needs a number", "contractNo")
      : contractNo.length > NO_MAX
        ? violation("contract_no_too_long", `contract number exceeds ${NO_MAX} characters`, "contractNo")
        : null,
    name === ""
      ? violation("name_required", "a contract needs a name", "name")
      : name.length > NAME_MAX
        ? violation("name_too_long", `name exceeds ${NAME_MAX} characters`, "name")
        : null,
    (CONTRACT_STATUSES as readonly string[]).includes(input.status)
      ? null
      : violation("unknown_status", `unknown contract status ${input.status}`, "status"),
    Number.isInteger(input.noticeDays) && input.noticeDays >= 0 && input.noticeDays <= 365
      ? null
      : violation("notice_out_of_range", "notice period must be 0-365 whole days", "noticeDays"),
    input.totalAmount !== null && !(Number.isFinite(input.totalAmount) && input.totalAmount >= 0)
      ? violation("amount_negative", "contract amount cannot be negative", "totalAmount")
      : null,
    input.termStart && input.termEnd && input.termEnd < input.termStart
      ? violation("term_inverted", "the term ends before it starts", "termEnd")
      : null,
    // IN FORCE MEANS A TERM. The DDL lets a draft leave it blank, but an active
    // contract without an end date is the one row the renewal window (§9.1)
    // can never see - it would sit outside every scan, silently.
    input.status === "active" && (!input.termStart || !input.termEnd)
      ? violation("term_required", "an active contract needs a start and an end", "termEnd")
      : null,
  ];

  if (held) {
    // The frozen keys (incr/0076 grants). Same code the column-lock mirror
    // would produce, raised before the adapter has to.
    if (held.contractNo !== contractNo) {
      checks.push(violation("frozen_field", "a contract number is its anchor and cannot change", "contractNo"));
    }
    if (held.accountId !== input.accountId) {
      checks.push(violation("frozen_field", "a contract cannot move to another customer", "accountId"));
    }
    if (held.opportunityId !== input.opportunityId) {
      checks.push(
        violation("frozen_field", "the deal a contract came from is a record, not a setting", "opportunityId"),
      );
    }
    // TERMINATED IS FINAL. Reopening one would resurrect 已购态 for products
    // the customer stopped paying for; a new agreement is a new contract.
    if (held.status === "terminated" && input.status !== "terminated") {
      checks.push(violation("illegal_transition", "a terminated contract cannot be reopened", "status"));
    }
    // Back to draft once in force would pull a signed agreement out of every
    // scan without saying it ended. Ending it is `terminated`.
    if (held.status === "active" && input.status === "draft") {
      checks.push(violation("illegal_transition", "an active contract cannot return to draft", "status"));
    }
  }

  return allOf(plan, checks);
}

/** Validate one line against the contract it hangs off. */
export function planContractLine(
  input: ContractLineDraft,
  contract: ContractFacts,
  held: ContractLineFacts | null = null,
): RuleResult<PlannedContractLine> {
  if (contract.status === "terminated") {
    return fail(violation("contract_closed", "a terminated contract takes no more changes", "contractId"));
  }
  const checks: Array<Violation | null> = [
    input.productId.trim() === ""
      ? violation("product_required", "a line names a product", "productId")
      : null,
    Number.isFinite(input.quantity) && input.quantity > 0
      ? null
      : violation("quantity_not_positive", "quantity must be greater than zero", "quantity"),
    Number.isFinite(input.unitPrice) && input.unitPrice >= 0
      ? null
      : violation("amount_negative", "unit price cannot be negative", "unitPrice"),
    // A LINE DOES NOT OUTLIVE ITS CONTRACT. A line whose own end is later than
    // the contract's would keep a product "owned" after the agreement behind
    // it is over.
    input.termEnd && contract.termEnd && input.termEnd > contract.termEnd
      ? violation("line_outside_term", "a line cannot end after its contract", "termEnd")
      : input.termEnd && contract.termStart && input.termEnd < contract.termStart
        ? violation("line_outside_term", "a line cannot end before its contract starts", "termEnd")
        : null,
    // product_id is the line's identity (no UPDATE grant). Another product is
    // another line.
    held && held.productId !== input.productId
      ? violation("frozen_field", "a line cannot change product; remove it and add another", "productId")
      : null,
  ];
  // Minor units, so 3 x 33.33 is 99.99 and not 99.99000000000001.
  const amount = fromMinor(Math.round(toMinor(input.unitPrice) * input.quantity));
  return allOf({ ...input, amount, currency: contract.currency }, checks);
}

export type ContractPhase = "draft" | "pending" | "in_force" | "lapsed" | "renewed" | "terminated";

/**
 * Where a contract stands on `now`, derived from status and term.
 *
 * `lapsed` is an ACTIVE contract whose term has run out and that nobody has
 * renewed or terminated - exactly the row the renewal work in batch two is for,
 * which is why it is surfaced rather than folded into `terminated`.
 */
export function contractPhase(
  c: Pick<ContractFacts, "status" | "termStart" | "termEnd"> & { renewedBy?: string | null },
  now: Date,
): ContractPhase {
  if (c.status === "draft") return "draft";
  if (c.status === "terminated") return "terminated";
  // Batch two: a contract that has a successor is answered for, whatever its
  // own term says - it must not read as an un-renewed lapse.
  if (c.renewedBy) return "renewed";
  if (c.termEnd && endOfDay(c.termEnd) < now) return "lapsed";
  if (c.termStart && c.termStart > now) return "pending";
  return "in_force";
}

/** Whole days until the term ends; negative once past, null with no end. */
export function daysToTermEnd(c: Pick<ContractFacts, "termEnd">, now: Date): number | null {
  if (!c.termEnd) return null;
  return Math.floor((endOfDay(c.termEnd).getTime() - now.getTime()) / DAY_MS);
}

/**
 * The last day the other side can still be told, per the contract's own
 * notice clause. A fact of the agreement, not the renewal window - §9.1's
 * window is batch two's to compute.
 */
export function noticeDeadline(c: { termEnd: Date | null; noticeDays: number }): Date | null {
  if (!c.termEnd) return null;
  return new Date(c.termEnd.getTime() - c.noticeDays * DAY_MS);
}

export interface OwnedProduct {
  productId: string;
  /** Summed across every in-force line naming this product. */
  quantity: number;
  /** When the LAST of those lines runs out; null when one has no end at all. */
  runsUntil: Date | null;
  contractIds: string[];
}

/**
 * 已购态 (§9.2): what this customer is running on `now`.
 *
 * In force = contract `active`, started, not lapsed; line not past its own
 * end. One row per product, because the question is "do they have it", and a
 * customer holding the same module under two contracts holds it once.
 */
export function ownedProducts(
  contracts: ReadonlyArray<ContractFacts & { lines: readonly ContractLineFacts[] }>,
  now: Date,
): OwnedProduct[] {
  const byProduct = new Map<string, OwnedProduct>();
  for (const c of contracts) {
    // Judged on status and term alone: a contract renewed EARLY is still in
    // force until its own term ends, and its products are still running.
    if (contractPhase({ status: c.status, termStart: c.termStart, termEnd: c.termEnd }, now) !== "in_force") continue;
    for (const line of c.lines) {
      const end = line.termEnd ?? c.termEnd;
      if (line.termEnd && endOfDay(line.termEnd) < now) continue;
      const held = byProduct.get(line.productId);
      if (!held) {
        byProduct.set(line.productId, {
          productId: line.productId,
          quantity: line.quantity,
          runsUntil: end,
          contractIds: [c.id],
        });
        continue;
      }
      held.quantity = fromMinor(toMinor(held.quantity) + toMinor(line.quantity));
      held.runsUntil = held.runsUntil === null || end === null ? null : end > held.runsUntil ? end : held.runsUntil;
      if (!held.contractIds.includes(c.id)) held.contractIds.push(c.id);
    }
  }
  return [...byProduct.values()];
}

/** One currency's row of 存量收入. */
export interface InstalledRevenueRow {
  currency: string;
  /** Contracts in force today, each scaled to one year of its own term. */
  annualized: number;
  inForce: number;
  /** Every signed (non-draft) contract's total, whatever its phase. */
  lifetime: number;
  signed: number;
}

export interface InstalledRevenue {
  rows: InstalledRevenueRow[];
  /** Signed contracts with no amount yet - counted, never guessed at. */
  unpriced: number;
}

/**
 * 存量收入 (owner, 2026-09-23): two figures, never one.
 *
 *   年化合同额 - the in-force contracts, each scaled to a year of its own term
 *                (total x 365 / term days). NOT called ARR: the catalog does not
 *                say which products are recurring, so a one-off contract in
 *                force today is annualized too, and the label must not claim
 *                more than the data knows.
 *   历史合同总额 - every signed contract's total, in force or not.
 *
 * One row per currency, never summed across (the same rule as every money
 * figure on the page). A signed contract without an amount is counted in
 * `unpriced`, not treated as zero - a zero would read as "worth nothing".
 * In force is judged exactly as `ownedProducts` judges it: status and term.
 */
export function installedRevenue(
  contracts: ReadonlyArray<Pick<ContractFacts, "status" | "currency" | "termStart" | "termEnd"> & { totalAmount: number | null }>,
  now: Date,
): InstalledRevenue {
  const rows = new Map<string, { annualized: number; inForce: number; lifetime: number; signed: number }>();
  let unpriced = 0;
  for (const c of contracts) {
    if (c.status === "draft") continue;
    if (c.totalAmount === null) {
      unpriced += 1;
      continue;
    }
    const row = rows.get(c.currency) ?? { annualized: 0, inForce: 0, lifetime: 0, signed: 0 };
    row.lifetime += toMinor(c.totalAmount);
    row.signed += 1;
    const phase = contractPhase({ status: c.status, termStart: c.termStart, termEnd: c.termEnd }, now);
    if (phase === "in_force" && c.termStart && c.termEnd) {
      const termDays = Math.floor((c.termEnd.getTime() - c.termStart.getTime()) / DAY_MS) + 1;
      row.annualized += Math.round((toMinor(c.totalAmount) * 365) / termDays);
      row.inForce += 1;
    }
    rows.set(c.currency, row);
  }
  return {
    rows: [...rows.entries()]
      .map(([currency, r]) => ({
        currency,
        annualized: fromMinor(r.annualized),
        inForce: r.inForce,
        lifetime: fromMinor(r.lifetime),
        signed: r.signed,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    unpriced,
  };
}

/** A term date is a calendar day: it is still in force for all of that day. */
function endOfDay(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS + DAY_MS - 1);
}

/* ---------------------------------------------------------------------------
 * 续约 (L4 batch two, incr/0078, business rules §9.1).
 * ------------------------------------------------------------------------ */

/** The event vocabulary (owner, 2026-09-22): expiry is derived, not an event. */
export const RENEWAL_EVENT_TYPES = ["renewed", "downgraded", "lost"] as const;
export type RenewalEventType = (typeof RENEWAL_EVENT_TYPES)[number];

/** An outcome a person records without a successor contract. */
export type RenewalOutcome = Exclude<RenewalEventType, "renewed">;

/**
 * Validate renewing `from` into `successor`.
 *
 * Only an ACTIVE contract renews: a draft has not been signed, a terminated one
 * ended by decision. One renewal per contract (§9.1) - the unique index is the
 * backstop, this is the sentence. The successor is on the same customer by
 * construction, so the account is taken from `from`, never from the form.
 */
export function planContractRenewal(
  from: ContractFacts & { renewedBy: string | null },
  successor: ContractDraft,
): RuleResult<ContractDraft> {
  if (from.renewedBy) {
    return fail(violation("already_renewed", "this contract has already been renewed", "contractId"));
  }
  if (from.status !== "active") {
    return fail(violation("contract_not_renewable", "only an active contract can be renewed", "contractId"));
  }
  const plan = planContract({ ...successor, accountId: from.accountId }, null);
  if (!plan.ok) return plan;
  // A successor that starts before its predecessor did is not a renewal of
  // it; overlap at the seam is allowed (early renewals are normal).
  if (plan.value.termStart && from.termStart && plan.value.termStart < from.termStart) {
    return fail(violation("renewal_before_original", "a renewal cannot start before the contract it renews", "termStart"));
  }
  return plan;
}

/** Validate recording `downgraded` or `lost`: the reason is the record. */
export function planRenewalOutcome(
  eventType: string,
  reason: string,
): RuleResult<{ eventType: RenewalOutcome; reason: string }> {
  const trimmed = reason.trim();
  return allOf({ eventType: eventType as RenewalOutcome, reason: trimmed }, [
    eventType === "downgraded" || eventType === "lost"
      ? null
      : violation("unknown_event_type", `unknown renewal outcome ${eventType}`, "eventType"),
    trimmed === ""
      ? violation("reason_required", "say why - an outcome with no reason audits nothing", "reason")
      : trimmed.length > 255
        ? violation("reason_too_long", "reason exceeds 255 characters", "reason")
        : null,
  ]);
}

export interface RenewalAnchor {
  contractId: string;
  contractNo: string;
  /** term_end minus notice_days: the last day the customer can still be told. */
  endsAt: Date;
  /** A draft successor exists: the renewal is already being negotiated. */
  inProgress: boolean;
}

/**
 * The date a project's renewal is judged against, taken from its contract
 * (§9.1: 合同优先). Null means "no contract answer" and the caller falls back
 * to the project's own end date - the fallback path the design requires to
 * stay alive.
 *
 * FOLLOWS THE LINEAGE. project.contract_id names the contract the delivery
 * started under; once that was renewed, the term that matters is the newest
 * one. A draft successor is still being negotiated, so the walk stops before
 * it and the renewal is judged by the contract actually in force.
 *
 * A TERMINATED TIP FALLS BACK, it does not dismiss the row: the contract no
 * longer speaks for the relationship, so the project's own date does - which
 * is also what the batch-two acceptance names.
 */
export function contractRenewalAnchor(
  startId: string,
  byId: ReadonlyMap<string, ContractFacts & { noticeDays: number }>,
  successorOf: ReadonlyMap<string, string>,
): RenewalAnchor | null {
  let current = byId.get(startId);
  if (!current) return null;
  // Bounded: the unique index makes the lineage a chain, and the self-renewal
  // CHECK removes the one-row cycle, but a bound costs nothing.
  for (let hops = 0; hops < 100; hops++) {
    const nextId = successorOf.get(current.id);
    const next = nextId ? byId.get(nextId) : undefined;
    if (!next || next.status === "draft") break;
    current = next;
  }
  if (current.status !== "active" || !current.termEnd) return null;
  return {
    contractId: current.id,
    contractNo: current.contractNo,
    endsAt: noticeDeadline({ termEnd: current.termEnd, noticeDays: current.noticeDays })!,
    inProgress: successorOf.has(current.id),
  };
}

export interface RenewalLineage {
  /** Contract ids, oldest first. Length 1 = never renewed and not a renewal. */
  readonly chain: readonly string[];
  /** 1-based position of the asked-for contract in `chain`. */
  readonly position: number;
}

/**
 * The whole renewal chain a contract sits in (YC-021 L4 续约世系) - what makes
 * "连续续了三年" readable. The card used to show one hop each way ("续自 X",
 * "已续为 Y"), so a third-year contract looked the same as a second-year one.
 *
 * Walks both ways from `id`. The database makes this a chain (UNIQUE on
 * renewed_from_contract_id, no self-renewal - incr/0076); the bound is for the
 * same reason contractRenewalAnchor has one. A predecessor the caller did not
 * read (another account's contract) simply ends the walk.
 */
export function renewalLineage(
  id: string,
  predecessorOf: ReadonlyMap<string, string>,
  successorOf: ReadonlyMap<string, string>,
): RenewalLineage {
  const back: string[] = [];
  let cur = id;
  for (let hops = 0; hops < 100; hops++) {
    const prev = predecessorOf.get(cur);
    if (!prev || prev === id || back.includes(prev)) break;
    back.unshift(prev);
    cur = prev;
  }
  const forward: string[] = [];
  cur = id;
  for (let hops = 0; hops < 100; hops++) {
    const next = successorOf.get(cur);
    if (!next || next === id || forward.includes(next) || back.includes(next)) break;
    forward.push(next);
    cur = next;
  }
  return { chain: [...back, id, ...forward], position: back.length + 1 };
}
