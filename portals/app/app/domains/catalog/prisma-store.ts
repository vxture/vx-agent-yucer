import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type {
  CatalogStore,
  DiscountApprovalRecord,
  OpportunityLineRecord,
  PriceEntryRecord,
  ProductRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "./store";

// Prisma-backed CatalogStore over yucer_catalog (+ yucer_pipeline.opportunity_line).
//
// THE FIRST ADAPTER THIS DOMAIN HAS HAD. incr/0007 created the tables in
// 2026-08-24 and the domain has run on the in-memory store ever since, which is
// why the read service could ship without one - and why every write below had
// to be checked against the column locks by hand rather than by precedent.
//
// Decimal columns arrive as Prisma.Decimal. `Number(String(v))` rather than
// `.toNumber()` is what the other adapters in this repo use, and it is the
// safer of the two: it does not depend on the Decimal implementation being the
// one bundled today.

const PRODUCT_TABLE = "yucer_catalog.product";
const SOLUTION_TABLE = "yucer_catalog.solution";
const ITEM_TABLE = "yucer_catalog.solution_item";

function num(v: unknown): number {
  return Number(String(v));
}

export class PrismaCatalogStore implements CatalogStore {
  async listProducts(workspaceId: string): Promise<ProductRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.product.findMany({ where: { workspaceId }, orderBy: { productCode: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      productCode: r.productCode,
      name: r.name,
      category: r.category,
      unit: r.unit,
      status: r.status as ProductRecord["status"],
    }));
  }

  async listSolutions(workspaceId: string): Promise<SolutionRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.solution.findMany({ where: { workspaceId }, orderBy: { solutionCode: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      solutionCode: r.solutionCode,
      name: r.name,
      summary: r.summary,
      status: r.status as SolutionRecord["status"],
    }));
  }

  async listSolutionItems(workspaceId: string, solutionId: string): Promise<SolutionItemRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.solutionItem.findMany({ where: { workspaceId, solutionId } });
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      solutionId: r.solutionId,
      productId: r.productId,
      quantity: num(r.quantity),
    }));
  }

  async priceFor(
    workspaceId: string,
    productId: string,
    currency: string,
  ): Promise<PriceEntryRecord | null> {
    const p = await getPrismaClient();
    // The latest entry that has TAKEN EFFECT. A future-dated price is a
    // decision already made and not yet in force; returning it would price
    // today's quote off next quarter's book.
    const row = await p.priceBookEntry.findFirst({
      where: { workspaceId, productId, currency, effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: "desc" },
    });
    return row ? this.toPrice(row) : null;
  }

  async listPrices(workspaceId: string): Promise<PriceEntryRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.priceBookEntry.findMany({
      where: { workspaceId },
      orderBy: { effectiveAt: "desc" },
    });
    return rows.map((r) => this.toPrice(r));
  }

  async upsertProduct(
    workspaceId: string,
    input: Omit<ProductRecord, "id" | "workspaceId">,
  ): Promise<ProductRecord> {
    const p = await getPrismaClient();
    const update = {
      name: input.name,
      category: input.category,
      unit: input.unit,
      status: input.status,
      updatedAt: new Date(),
    };
    // The update half only - the create half writes the anchors once, which is
    // exactly what the column lock permits and what assertWritable is checking.
    const guard = assertWritable(PRODUCT_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked product column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const row = await p.product.upsert({
      where: { workspaceId_productCode: { workspaceId, productCode: input.productCode } },
      update,
      create: { workspaceId, productCode: input.productCode, ...update },
    });
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      productCode: row.productCode,
      name: row.name,
      category: row.category,
      unit: row.unit,
      status: row.status as ProductRecord["status"],
    };
  }

  async upsertSolution(
    workspaceId: string,
    input: Omit<SolutionRecord, "id" | "workspaceId">,
    items: readonly Omit<SolutionItemRecord, "id" | "workspaceId" | "solutionId">[],
  ): Promise<SolutionRecord> {
    const p = await getPrismaClient();
    const update = {
      name: input.name,
      summary: input.summary,
      status: input.status,
      updatedAt: new Date(),
    };
    const guard = assertWritable(SOLUTION_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked solution column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    // ONE TRANSACTION. The items are REPLACED, so a failure between the delete
    // and the insert would leave a solution that contains nothing - and an
    // empty bundle is precisely what planSolution refuses to let anyone create
    // on purpose.
    return p.$transaction(async (tx) => {
      const row = await tx.solution.upsert({
        where: { workspaceId_solutionCode: { workspaceId, solutionCode: input.solutionCode } },
        update,
        create: { workspaceId, solutionCode: input.solutionCode, ...update },
      });
      await tx.solutionItem.deleteMany({ where: { workspaceId, solutionId: row.id } });
      if (items.length > 0) {
        await tx.solutionItem.createMany({
          data: items.map((i) => ({
            workspaceId,
            solutionId: row.id,
            productId: i.productId,
            quantity: i.quantity,
          })),
        });
      }
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        solutionCode: row.solutionCode,
        name: row.name,
        summary: row.summary,
        status: row.status as SolutionRecord["status"],
      };
    });
  }

  async appendPrice(
    workspaceId: string,
    input: Omit<PriceEntryRecord, "id" | "workspaceId">,
  ): Promise<PriceEntryRecord> {
    const p = await getPrismaClient();
    // CREATE, never upsert. `effective_at` is part of the unique key, so a new
    // price at a new instant is a new row - which is what keeps the superseded
    // entries readable and makes the book a book. A collision means two prices
    // for the same product, currency and instant, and that is genuinely one
    // price submitted twice.
    const row = await p.priceBookEntry.create({
      data: {
        workspaceId,
        productId: input.productId,
        currency: input.currency,
        listPrice: input.listPrice,
        floorPrice: input.floorPrice,
        effectiveAt: input.effectiveAt,
      },
    });
    return this.toPrice(row);
  }

  async listLines(workspaceId: string, opportunityId: string): Promise<OpportunityLineRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.opportunityLine.findMany({ where: { workspaceId, opportunityId } });
    return rows.map((r) => this.toLine(r));
  }

  async allLines(workspaceId: string): Promise<OpportunityLineRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.opportunityLine.findMany({ where: { workspaceId } });
    return rows.map((r) => this.toLine(r));
  }

  async replaceLines(
    workspaceId: string,
    opportunityId: string,
    lines: readonly Omit<OpportunityLineRecord, "id" | "workspaceId" | "opportunityId">[],
  ): Promise<OpportunityLineRecord[]> {
    const p = await getPrismaClient();
    return p.$transaction(async (tx) => {
      await tx.opportunityLine.deleteMany({ where: { workspaceId, opportunityId } });
      for (const l of lines) {
        await tx.opportunityLine.create({
          data: {
            workspaceId,
            opportunityId,
            productId: l.productId,
            solutionId: l.solutionId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            currency: l.currency,
            needsApproval: l.needsApproval,
          },
        });
      }
      const rows = await tx.opportunityLine.findMany({ where: { workspaceId, opportunityId } });
      return rows.map((r) => this.toLine(r));
    });
  }

  async listApprovals(
    workspaceId: string,
    opportunityId: string,
  ): Promise<DiscountApprovalRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.lineDiscountApproval.findMany({
      where: { workspaceId, opportunityId },
      orderBy: { approvedAt: "desc" },
    });
    return rows.map((r) => this.toApproval(r));
  }

  async allApprovals(workspaceId: string): Promise<DiscountApprovalRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.lineDiscountApproval.findMany({ where: { workspaceId } });
    return rows.map((r) => this.toApproval(r));
  }

  /**
   * `create`, never upsert. A second signature on the same price is a second
   * row - the table records who signed and when, and collapsing two signings
   * into one would lose the earlier one.
   */
  async appendApproval(
    workspaceId: string,
    input: Omit<DiscountApprovalRecord, "id" | "workspaceId">,
  ): Promise<DiscountApprovalRecord> {
    const p = await getPrismaClient();
    const row = await p.lineDiscountApproval.create({
      data: {
        workspaceId,
        opportunityId: input.opportunityId,
        productId: input.productId,
        unitPrice: input.unitPrice,
        currency: input.currency,
        floorPrice: input.floorPrice,
        reason: input.reason,
        approvedBySub: input.approvedBySub,
        approvedAt: input.approvedAt,
      },
    });
    return this.toApproval(row);
  }

  private toApproval(r: {
    id: string;
    workspaceId: string;
    opportunityId: string;
    productId: string;
    unitPrice: unknown;
    currency: string;
    floorPrice: unknown;
    reason: string;
    approvedBySub: string;
    approvedAt: Date;
  }): DiscountApprovalRecord {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      opportunityId: r.opportunityId,
      productId: r.productId,
      unitPrice: Number(String(r.unitPrice)),
      currency: r.currency,
      floorPrice: Number(String(r.floorPrice)),
      reason: r.reason,
      approvedBySub: r.approvedBySub,
      approvedAt: r.approvedAt,
    };
  }

  private toPrice(r: {
    id: string;
    workspaceId: string;
    productId: string;
    currency: string;
    listPrice: unknown;
    floorPrice: unknown;
    effectiveAt: Date;
  }): PriceEntryRecord {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      productId: r.productId,
      currency: r.currency,
      listPrice: num(r.listPrice),
      floorPrice: num(r.floorPrice),
      effectiveAt: r.effectiveAt,
    };
  }

  private toLine(r: {
    id: string;
    workspaceId: string;
    opportunityId: string;
    productId: string;
    solutionId: string | null;
    quantity: unknown;
    unitPrice: unknown;
    amount: unknown;
    currency: string;
    needsApproval: boolean;
  }): OpportunityLineRecord {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      opportunityId: r.opportunityId,
      productId: r.productId,
      solutionId: r.solutionId,
      quantity: num(r.quantity),
      unitPrice: num(r.unitPrice),
      amount: num(r.amount),
      currency: r.currency,
      needsApproval: r.needsApproval,
    };
  }
}
