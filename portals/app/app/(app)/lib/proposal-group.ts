// Which kind of move a proposal is, by the ADR-015 capability that produced
// it - so a reader can see whether they are signing a commercial move or a
// relationship one. Shared by the deal page and its deck (deal batch 2c):
// one mapping, so the two cannot label the same proposal differently.

const GROUP: Readonly<Record<string, "commercial" | "relation" | "technical">> = {
  "deal.stall_risk": "commercial",
  "deal.competition": "commercial",
  "pricing.discount_approval": "commercial",
  "account.chain_map": "relation",
  "account.cadence": "relation",
  "delivery.payment_risk": "technical",
};

export function proposalGroup(
  capability: string | null,
  t: { readonly planCommercial: string; readonly planRelation: string; readonly planTechnical: string },
): string {
  const g = GROUP[capability ?? ""] ?? "commercial";
  return g === "relation" ? t.planRelation : g === "technical" ? t.planTechnical : t.planCommercial;
}
