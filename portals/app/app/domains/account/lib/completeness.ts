import { coveringTerritories, type RoutingTerritory } from "../../signal/lib/routing";

// What is missing from a customer record, and what the product can fill in.
//
// The owner's ask of 2026-09-01: the agent should analyse, recommend, and make
// filling a record one click - especially the first time somebody types a
// customer in.
//
// TWO KINDS OF GAP, AND EACH HAS ITS OWN ANSWERER. Naming which is which is the
// whole job of this module, because the two cost wildly different things:
//
//   DERIVABLE   the answer is already in this workspace's rows. A customer with
//               a deal filed in East China is in a region East China covers.
//               Free, instant, and certain - so ASKING A MODEL FOR IT WOULD BE
//               A DEFECT, not a feature: it would be paying Atlas, and waiting,
//               to be told something the database already knows, and doing it
//               with less certainty than a join.
//   FOR THE     the answer is a fact about the world rather than about these
//   MODEL       rows. An industry cannot be inferred from a schema. This is not
//               a dead end - it is precisely what the model plane is for, and
//               it is where the product earns its keep.
//
// SO THIS MODULE DOES THE CHEAP HALF AND NAMES THE OTHER. `forModel` marks the
// gaps worth a turn, and the copilot answers them through the path that already
// exists: the model proposes via PROPOSE_ACTION_TOOL, the proposal lands in the
// queue as `fill_account_field`, and a person accepts it. One click, and the
// executor writes the field on the accepter's own permissions.
//
// WHICH MEANS ADR-003 HOLDS WITHOUT A SECOND MECHANISM. The machine proposes
// and a human decides - the same queue, the same accept button, the same audit
// trail as every other thing it suggests. A separate "smart fill" that wrote
// directly would be a second way for the agent to change data, and the only one
// with no signature on it.

/** A customer, reduced to what completeness reads. */
export interface CompletableAccount {
  id: string;
  name: string;
  industry: string | null;
  region: string | null;
  segmentCode: string | null;
  ownerSub: string | null;
}

/** A deal on that customer, reduced the same way. */
export interface AccountEvidence {
  territoryId: string | null;
  ownerSub: string | null;
}

/** A segment, and the criteria that decide whether a customer is in it. */
export interface SegmentCriteria {
  code: string;
  industries: readonly string[];
  regions: readonly string[];
}

export const FILLABLE_FIELDS = ["region", "industry", "segmentCode", "ownerSub"] as const;
export type FillableField = (typeof FILLABLE_FIELDS)[number];

export interface AccountGap {
  field: FillableField | "regionUnplaced";
  /**
   * What the DATA says to fill in, or null when the data does not know.
   *
   * Null is not a dead end - see `forModel`. It means this gap is not one a
   * join can close, which is a different statement from "unanswerable".
   */
  suggestion: string | null;
  /**
   * Worth spending a model turn on.
   *
   * True where the answer exists in the world but not in these rows - an
   * industry, or a region for a customer with no deals yet. False where the
   * data already answered, and false where nobody could: `regionUnplaced` is a
   * decision about the sales organisation, and no amount of intelligence about
   * the customer settles which territory ought to cover them.
   */
  forModel: boolean;
  /**
   * The fact the suggestion was read from, in the product's own terms.
   *
   * REQUIRED WHENEVER THERE IS A SUGGESTION. A one-click fill that cannot say
   * where the value came from is a machine writing into a customer record on
   * nobody's authority - and the person clicking is the one who will answer for
   * it. This is the same reason a stage change carries the model's rationale
   * into the journal.
   */
  basis: string | null;
}

/**
 * Everything missing or wrong on one customer.
 *
 * ORDER IS THE FILLING ORDER, not an accident: region first, because the
 * segment rule reads it, and the segment last for the same reason. Filling them
 * in the order returned means each suggestion is computed against what the
 * previous one settled.
 */
export function accountGaps(
  account: CompletableAccount,
  deals: readonly AccountEvidence[],
  territories: readonly RoutingTerritory[],
  segments: readonly SegmentCriteria[],
): AccountGap[] {
  const gaps: AccountGap[] = [];

  // --- region -----------------------------------------------------------
  if (!account.region) {
    // DERIVED FROM WHERE ITS DEALS ARE FILED. A territory names the regions it
    // covers (incr/0017), so a deal filed in one places its customer on that
    // ground. Suggested only when the covering territory names EXACTLY ONE
    // region: a territory covering 华东 and 华中 cannot tell us which, and
    // picking the first would be a coin toss written into a customer record.
    const territoryIds = new Set(deals.map((d) => d.territoryId).filter((t): t is string => !!t));
    const regions = new Set(
      territories.filter((t) => territoryIds.has(t.id)).flatMap((t) => t.regions ?? []),
    );
    const only = regions.size === 1 ? [...regions][0] : null;
    gaps.push({
      field: "region",
      suggestion: only,
      basis: only
        ? `deals filed in ${[...territoryIds].length === 1 ? "a territory" : "territories"} covering only ${only}`
        : null,
      // A customer with no deals, or deals across an ambiguous territory, is
      // exactly the first-entry case the owner asked about: nothing in the
      // workspace places them yet, and the company is a real thing the model
      // can be asked about by name.
      forModel: only === null,
    });
  } else if (coveringTerritories(account.region, territories).length === 0) {
    // 未分区. NOT a missing value - the record is filled in, and no territory
    // claims the ground it names. It is reported because of what it silently
    // does: an unplaced customer is visible to EVERY territory member, so a
    // filing gap quietly widens who can see this customer's work.
    //
    // No suggestion, deliberately. The fix is either a correction to this
    // region or a territory that covers it, and both are decisions about the
    // sales organisation rather than about this record.
    gaps.push({
      field: "regionUnplaced",
      suggestion: null,
      basis: `${account.region} is covered by no territory`,
      // NOT a model question. Which territory ought to cover 东北 is a decision
      // about how this company organises its sales, and no fact about the
      // customer settles it. Asking would produce a confident answer to a
      // question the model cannot have.
      forModel: false,
    });
  }

  // --- industry ---------------------------------------------------------
  if (!account.industry) {
    // NOT DERIVABLE, and saying so is the point. An industry is a fact about
    // the world, not about these rows, and a guessed one silently decides the
    // segment, which decides which playbook the copilot cites.
    // THE CASE THE MODEL PLANE EXISTS FOR. A schema cannot know what a company
    // does; the model can, from the name, and it is a fact somebody would
    // otherwise look up by hand on first entry.
    gaps.push({ field: "industry", suggestion: null, basis: null, forModel: true });
  }

  // --- segment ----------------------------------------------------------
  if (!account.segmentCode) {
    // Matched on the segment's own criteria, which is data an administrator
    // maintains - so this is reading a rule somebody wrote, not inventing one.
    // Ambiguity refuses to choose for the same reason region does.
    const matches = account.industry
      ? segments.filter(
          (s) =>
            s.industries.includes(account.industry as string) &&
            (s.regions.length === 0 || (account.region != null && s.regions.includes(account.region))),
        )
      : [];
    const only = matches.length === 1 ? matches[0] : null;
    gaps.push({
      field: "segmentCode",
      suggestion: only ? only.code : null,
      basis: only ? `${account.industry} matches only ${only.code}` : null,
      // Never the model's question. The segment is decided by criteria an
      // administrator wrote down; asking a model to guess at it would override
      // a rule somebody in this company owns.
      forModel: false,
    });
  }

  // --- owner ------------------------------------------------------------
  if (!account.ownerSub) {
    // WHOEVER IS ALREADY WORKING IT. A customer with deals but no owner is an
    // accounting gap, not an open question - somebody is plainly on it. One
    // owner among the deals is an answer; two is a decision, and this rule does
    // not make decisions.
    const owners = new Set(deals.map((d) => d.ownerSub).filter((o): o is string => !!o));
    const only = owners.size === 1 ? [...owners][0] : null;
    gaps.push({
      field: "ownerSub",
      suggestion: only,
      basis: only ? "the only person holding deals on this customer" : null,
      // Never the model's question either: who should own a customer is a
      // staffing decision, and the routing rule already answers it from
      // territory and load when nobody is on it yet.
      forModel: false,
    });
  }

  return gaps;
}

/** Gaps the data can close on its own - what a one-click fill writes for free. */
export function fillable(gaps: readonly AccountGap[]): AccountGap[] {
  return gaps.filter((g) => g.suggestion !== null);
}

/**
 * Gaps worth asking the model about.
 *
 * Separate from `fillable` so a caller can do the free half without paying for
 * a turn - and so the expensive half is an explicit, countable decision rather
 * than something that happens because a page rendered.
 */
export function forModel(gaps: readonly AccountGap[]): AccountGap[] {
  return gaps.filter((g) => g.forModel);
}
