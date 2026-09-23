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

export type ContractPhase = "draft" | "pending" | "in_force" | "lapsed" | "terminated";

/**
 * Where a contract stands on `now`, derived from status and term.
 *
 * `lapsed` is an ACTIVE contract whose term has run out and that nobody has
 * renewed or terminated - exactly the row the renewal work in batch two is for,
 * which is why it is surfaced rather than folded into `terminated`.
 */
export function contractPhase(
  c: Pick<ContractFacts, "status" | "termStart" | "termEnd">,
  now: Date,
): ContractPhase {
  if (c.status === "draft") return "draft";
  if (c.status === "terminated") return "terminated";
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
    if (contractPhase(c, now) !== "in_force") continue;
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

/** A term date is a calendar day: it is still in force for all of that day. */
function endOfDay(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS + DAY_MS - 1);
}
