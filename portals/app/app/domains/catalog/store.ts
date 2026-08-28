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

/**
 * One signature authorising one price below one product's floor (incr/0012).
 *
 * Deliberately NOT a column on the line. Lines are written by replace, so an
 * approval held on a line would be destroyed whenever any OTHER line on the
 * same deal was edited. Keyed by the price instead: re-quoting lower matches
 * nothing and needs a new signature, re-quoting back up matches again.
 */
export interface DiscountApprovalRecord {
  id: string;
  workspaceId: string;
  opportunityId: string;
  productId: string;
  /** The exact number signed off. A line matches only on equality. */
  unitPrice: number;
  currency: string;
  /** The floor in force at signing, copied in - a price book moves. */
  floorPrice: number;
  reason: string;
  approvedBySub: string;
  approvedAt: Date;
}

export interface CatalogStore {
  listProducts(workspaceId: string): Promise<ProductRecord[]>;
  listSolutions(workspaceId: string): Promise<SolutionRecord[]>;
  listSolutionItems(workspaceId: string, solutionId: string): Promise<SolutionItemRecord[]>;
  /** The entry in force for a product, or null when it is not priced. */
  priceFor(workspaceId: string, productId: string, currency: string): Promise<PriceEntryRecord | null>;
  /**
   * Every price entry in the workspace, newest first.
   *
   * Separate from priceFor because a price BOOK is a different question from a
   * price: the book shows what is on offer and at what floor, including the
   * superseded rows that explain how today's number was arrived at. Fanning
   * priceFor out over the product list could not produce it - the caller would
   * have to guess the currencies.
   */
  listPrices(workspaceId: string): Promise<PriceEntryRecord[]>;

  // --- writes (batch 6b-1b, ADR-017) ---------------------------------------
  //
  // UPSERT BY BUSINESS CODE, not by id. `product_code` and `solution_code` are
  // the workspace-unique keys the DDL declares, and they are what a person
  // types; ids are generated. Keying on the code means importing the same
  // catalogue twice updates rather than duplicating, which is the normal way
  // catalogues arrive.
  upsertProduct(
    workspaceId: string,
    input: Omit<ProductRecord, "id" | "workspaceId">,
  ): Promise<ProductRecord>;
  upsertSolution(
    workspaceId: string,
    input: Omit<SolutionRecord, "id" | "workspaceId">,
    items: readonly Omit<SolutionItemRecord, "id" | "workspaceId" | "solutionId">[],
  ): Promise<SolutionRecord>;
  /**
   * A price is APPENDED, never edited in place.
   *
   * `effective_at` is part of the unique key, so a new price at a new instant
   * is a new row and the superseded one stays readable - which is what makes a
   * price BOOK different from a price. The UPDATE grant on list/floor exists
   * for correcting a typo in a row that was just written, not for rewriting
   * history, and this port deliberately does not expose that.
   */
  appendPrice(
    workspaceId: string,
    input: Omit<PriceEntryRecord, "id" | "workspaceId">,
  ): Promise<PriceEntryRecord>;

  listLines(workspaceId: string, opportunityId: string): Promise<OpportunityLineRecord[]>;
  /** Every line in the workspace, for product-level rollups. */
  allLines(workspaceId: string): Promise<OpportunityLineRecord[]>;
  replaceLines(
    workspaceId: string,
    opportunityId: string,
    lines: readonly Omit<OpportunityLineRecord, "id" | "workspaceId" | "opportunityId">[],
  ): Promise<OpportunityLineRecord[]>;

  /** Every signature on this deal, newest first. Append-only (ADR-019). */
  listApprovals(workspaceId: string, opportunityId: string): Promise<DiscountApprovalRecord[]>;
  /** Every signature in the workspace, for the same rollups allLines feeds. */
  allApprovals(workspaceId: string): Promise<DiscountApprovalRecord[]>;
  appendApproval(
    workspaceId: string,
    input: Omit<DiscountApprovalRecord, "id" | "workspaceId">,
  ): Promise<DiscountApprovalRecord>;
}

export class InMemoryCatalogStore implements CatalogStore {
  private products: ProductRecord[] = [];
  private solutions: SolutionRecord[] = [];
  private items: SolutionItemRecord[] = [];
  private prices: PriceEntryRecord[] = [];
  private lines: OpportunityLineRecord[] = [];
  private approvals: DiscountApprovalRecord[] = [];
  private seq = 0;

  seed(input: {
    products?: ProductRecord[];
    solutions?: SolutionRecord[];
    items?: SolutionItemRecord[];
    prices?: PriceEntryRecord[];
    lines?: OpportunityLineRecord[];
    approvals?: DiscountApprovalRecord[];
  }): void {
    if (input.products) this.products = [...input.products];
    if (input.solutions) this.solutions = [...input.solutions];
    if (input.items) this.items = [...input.items];
    if (input.prices) this.prices = [...input.prices];
    if (input.lines) this.lines = [...input.lines];
    if (input.approvals) this.approvals = [...input.approvals];
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

  async upsertProduct(
    workspaceId: string,
    input: Omit<ProductRecord, "id" | "workspaceId">,
  ): Promise<ProductRecord> {
    const at = this.products.findIndex(
      (x) => x.workspaceId === workspaceId && x.productCode === input.productCode,
    );
    if (at >= 0) {
      // The code and the workspace are the identity - they are what was matched
      // on, so they are not among the fields an upsert may move.
      const next = { ...this.products[at]!, ...input, productCode: this.products[at]!.productCode };
      this.products[at] = next;
      return next;
    }
    const row: ProductRecord = { id: `prd_${++this.seq}`, workspaceId, ...input };
    this.products.push(row);
    return row;
  }

  async upsertSolution(
    workspaceId: string,
    input: Omit<SolutionRecord, "id" | "workspaceId">,
    items: readonly Omit<SolutionItemRecord, "id" | "workspaceId" | "solutionId">[],
  ): Promise<SolutionRecord> {
    const at = this.solutions.findIndex(
      (x) => x.workspaceId === workspaceId && x.solutionCode === input.solutionCode,
    );
    let row: SolutionRecord;
    if (at >= 0) {
      row = { ...this.solutions[at]!, ...input, solutionCode: this.solutions[at]!.solutionCode };
      this.solutions[at] = row;
    } else {
      row = { id: `sol_${++this.seq}`, workspaceId, ...input };
      this.solutions.push(row);
    }
    // REPLACED WHOLE, like opportunity lines. A solution's contents are a set,
    // and merging by product id would leave a removed product silently in the
    // bundle - the caller sent the list it wants, not a patch.
    this.items = this.items.filter(
      (i) => !(i.workspaceId === workspaceId && i.solutionId === row.id),
    );
    for (const it of items) {
      this.items.push({ id: `sit_${++this.seq}`, workspaceId, solutionId: row.id, ...it });
    }
    return row;
  }

  async appendPrice(
    workspaceId: string,
    input: Omit<PriceEntryRecord, "id" | "workspaceId">,
  ): Promise<PriceEntryRecord> {
    const row: PriceEntryRecord = { id: `pbe_${++this.seq}`, workspaceId, ...input };
    this.prices.push(row);
    return row;
  }

  async listPrices(workspaceId: string): Promise<PriceEntryRecord[]> {
    return this.prices
      .filter((p) => p.workspaceId === workspaceId)
      .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());
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

  async listApprovals(
    workspaceId: string,
    opportunityId: string,
  ): Promise<DiscountApprovalRecord[]> {
    return this.approvals
      .filter((a) => a.workspaceId === workspaceId && a.opportunityId === opportunityId)
      .sort((a, b) => b.approvedAt.getTime() - a.approvedAt.getTime());
  }

  async allApprovals(workspaceId: string): Promise<DiscountApprovalRecord[]> {
    return this.approvals.filter((a) => a.workspaceId === workspaceId);
  }

  async appendApproval(
    workspaceId: string,
    input: Omit<DiscountApprovalRecord, "id" | "workspaceId">,
  ): Promise<DiscountApprovalRecord> {
    const created = { ...input, id: `appr_${++this.seq}`, workspaceId };
    this.approvals.push(created);
    return created;
  }
}
