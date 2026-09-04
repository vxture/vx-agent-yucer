// Which role a person plays ON ONE DEAL - incr/0027, ADR-024 batch D.
//
// A buying role is per-purchase by definition - the same person can be the
// economic buyer on one deal and a user on the next - and this repo used to
// store it as a global property of the person, so every deal at one customer
// shared a single decision chain and a single badge.
//
// THERE IS NO CUSTOMER-LEVEL ROLE ANY MORE, and no fallback to one. A person
// has a name, a way to reach them and a job title; what they are to a purchase
// is a statement about that purchase. A deal that has said nothing reports
// `unknown` for everybody, which analyzeChain treats as covering no role at
// all - so it reports every required role missing, which is TRUE. The old
// behaviour reported coverage the deal had never established.
//
// An earlier draft of this file kept person.decision_role as a default to fall
// back to. That was written to protect roles on customers with no open deal -
// data which does not exist, because the product has no users and every row is
// seed data this repository writes. Removed rather than kept: the cost was the
// exact one ADR-024 named, and it bought nothing.

import type { ContactNode, DecisionRole } from "./health";

/** The person half: who is at this customer, and are they still there. */
export interface ChainPerson {
  readonly id: string;
  readonly status: string;
}

/** One person's stated role on one deal. Absence is meaningful - see above. */
export interface OpportunityContactLink {
  readonly personId: string;
  readonly buyingRole: DecisionRole;
  readonly influence: number | null;
}

/**
 * The chain nodes for ONE opportunity: the customer's people, with each
 * person's role on THIS deal where one is stated and their default where it is
 * not.
 *
 * RETURNS ContactNode SO analyzeChain IS UNTOUCHED. The graph walk - coaches to
 * the economic buyer, undirected, refusing to pass through an opponent - is
 * correct and tested, and it never cared where a role came from. Threading an
 * opportunity through it would have coupled a reachability search to a data
 * source for no gain; resolving the roles first keeps the two separable, and
 * keeps the account-level call working by passing no links at all.
 *
 * INFLUENCE FALLS BACK INDEPENDENTLY of the role. A deal can state that
 * somebody matters more here without restating what they are, and a link that
 * left influence null is saying "no per-deal judgement", not "zero".
 */
export function chainForOpportunity(
  contacts: readonly ChainPerson[],
  links: readonly OpportunityContactLink[],
): ContactNode[] {
  const byPerson = new Map(links.map((l) => [l.personId, l]));
  return contacts.map((c) => {
    const link = byPerson.get(c.id);
    return {
      id: c.id,
      status: c.status,
      // UNKNOWN IS THE HONEST DEFAULT and it is not a gap being hidden:
      // analyzeChain treats `unknown` as covering nothing, so a deal where
      // nobody has said who is who reports every required role missing. That is
      // true. The old behaviour - a role on the person, used for every deal -
      // reported coverage this deal had never established.
      decisionRole: link?.buyingRole ?? "unknown",
      influence: link?.influence ?? null,
    };
  });
}
