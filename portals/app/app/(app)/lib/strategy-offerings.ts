import type { ProductReference, SolutionReference } from "../../domains/catalog/service";

export interface StrategyOffering {
  key: string;
  kind: "product" | "solution";
  id: string;
  name: string;
  code: string;
  status: "active" | "retired";
  icon: "cube" | "stack";
  href: string;
}
/** Type is part of the identity: a product and a solution may share a UUID. */
export function strategyOfferings(solutions: readonly SolutionReference[] | null | undefined, products: readonly ProductReference[] | null | undefined): StrategyOffering[] {
  return [
    ...(solutions ?? []).map(s => ({ key: `solution:${s.id}`, kind: "solution" as const, id: s.id, name: s.name,
      code: s.solutionCode, status: s.status, icon: "stack" as const, href: `/solution?solution=${encodeURIComponent(s.id)}` })),
    ...(products ?? []).map(p => ({ key: `product:${p.id}`, kind: "product" as const, id: p.id, name: p.name,
      code: p.productCode, status: p.status, icon: "cube" as const, href: `/catalog?product=${encodeURIComponent(p.id)}` })),
  ];
}
