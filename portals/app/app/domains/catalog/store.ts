// The product catalogue - see ADR-014.
//
// A dimension referenced across domains and written by none of them: deals,
// contracts, delivery and signal matching all read it. Nothing here knows what
// an opportunity is; the line lives on the pipeline side and points in.

export interface ProductRecord {
  id: string;
  workspaceId: string;
  productCode: string;
  name: string;
  category: string | null;
  unit: string;
  status: "active" | "retired";
}

export interface SolutionRecord {
  id: string;
  workspaceId: string;
  solutionCode: string;
  name: string;
  summary: string | null;
  status: "active" | "retired";
}

export interface SolutionItemRecord {
  id: string;
  workspaceId: string;
  solutionId: string;
  productId: string;
  quantity: number;
}

/**
 * A price at a point in time.
 *
 * `floorPrice` is why the table exists: without it a price book is a reference
 * sheet whose presence changes nothing. With it, a line priced below the floor
 * is a decision somebody has to sign.
 */
export interface PriceEntryRecord {
  id: string;
  workspaceId: string;
  productId: string;
  currency: string;
  listPrice: number;
  floorPrice: number;
  effectiveAt: Date;
}

/** One product on one deal. See ADR-014 section 2 for who is authoritative. */
export interface OpportunityLineRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  productId: string;
  /** Provenance only - never used to decide which products are in the deal. */
  solutionId: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  currency: string;
  needsApproval: boolean;
}

export interface CatalogStore {
  listProducts(workspaceId: string): Promise<ProductRecord[]>;
  listSolutions(workspaceId: string): Promise<SolutionRecord[]>;
  listSolutionItems(workspaceId: string, solutionId: string): Promise<SolutionItemRecord[]>;
  /** The entry in force for a product, or null when it is not priced. */
  priceFor(workspaceId: string, productId: string, currency: string): Promise<PriceEntryRecord | null>;

  listLines(workspaceId: string, opportunityId: string): Promise<OpportunityLineRecord[]>;
  /** Every line in the workspace, for product-level rollups. */
  allLines(workspaceId: string): Promise<OpportunityLineRecord[]>;
  replaceLines(
    workspaceId: string,
    opportunityId: string,
    lines: readonly Omit<OpportunityLineRecord, "id" | "workspaceId" | "opportunityId">[],
  ): Promise<OpportunityLineRecord[]>;
}

export class InMemoryCatalogStore implements CatalogStore {
  private products: ProductRecord[] = [];
  private solutions: SolutionRecord[] = [];
  private items: SolutionItemRecord[] = [];
  private prices: PriceEntryRecord[] = [];
  private lines: OpportunityLineRecord[] = [];
  private seq = 0;

  seed(input: {
    products?: ProductRecord[];
    solutions?: SolutionRecord[];
    items?: SolutionItemRecord[];
    prices?: PriceEntryRecord[];
    lines?: OpportunityLineRecord[];
  }): void {
    if (input.products) this.products = [...input.products];
    if (input.solutions) this.solutions = [...input.solutions];
    if (input.items) this.items = [...input.items];
    if (input.prices) this.prices = [...input.prices];
    if (input.lines) this.lines = [...input.lines];
  }

  async listProducts(workspaceId: string): Promise<ProductRecord[]> {
    return this.products.filter((p) => p.workspaceId === workspaceId);
  }

  async listSolutions(workspaceId: string): Promise<SolutionRecord[]> {
    return this.solutions.filter((s) => s.workspaceId === workspaceId);
  }

  async listSolutionItems(workspaceId: string, solutionId: string): Promise<SolutionItemRecord[]> {
    return this.items.filter((i) => i.workspaceId === workspaceId && i.solutionId === solutionId);
  }

  async priceFor(workspaceId: string, productId: string, currency: string): Promise<PriceEntryRecord | null> {
    // The latest entry that has taken effect. Sorted rather than assumed,
    // because seed order is not chronological order.
    const rows = this.prices
      .filter((p) => p.workspaceId === workspaceId && p.productId === productId && p.currency === currency)
      .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());
    return rows[0] ?? null;
  }

  async listLines(workspaceId: string, opportunityId: string): Promise<OpportunityLineRecord[]> {
    return this.lines.filter((l) => l.workspaceId === workspaceId && l.opportunityId === opportunityId);
  }

  async allLines(workspaceId: string): Promise<OpportunityLineRecord[]> {
    return this.lines.filter((l) => l.workspaceId === workspaceId);
  }

  async replaceLines(
    workspaceId: string,
    opportunityId: string,
    lines: readonly Omit<OpportunityLineRecord, "id" | "workspaceId" | "opportunityId">[],
  ): Promise<OpportunityLineRecord[]> {
    this.lines = this.lines.filter(
      (l) => !(l.workspaceId === workspaceId && l.opportunityId === opportunityId),
    );
    const created = lines.map((l) => ({
      ...l,
      id: `line_${++this.seq}`,
      workspaceId,
      opportunityId,
    }));
    this.lines.push(...created);
    return created;
  }
}
