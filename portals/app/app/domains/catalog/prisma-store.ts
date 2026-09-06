import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type {
  CatalogStore,
  DiscountApprovalRecord,
  OpportunityLineRecord,
  PriceDraft,
  PriceEntryRecord,
  ProductRecord,
  ProductStatusRecord,
  ProductTypeRecord,
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
const PRODUCT_TYPE_TABLE = "yucer_catalog.product_type";
const PRODUCT_STATUS_TABLE = "yucer_catalog.product_status";
const SOLUTION_TABLE = "yucer_catalog.solution";
const ITEM_TABLE = "yucer_catalog.solution_item";

function num(v: unknown): number {
  return Number(String(v));
}

export class PrismaCatalogStore implements CatalogStore {
  async listProducts(workspaceId: string): Promise<ProductRecord[]> {
    const p = await getPrismaClient();
    // Catalogue order; code as the tiebreak so rows still on the DDL default 0
    // come out deterministically.
    const rows = await p.product.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { productCode: "asc" }],
    });
    return rows.map((r) => this.toProduct(r));
  }

  private toProduct(row: {
    id: string;
    workspaceId: string;
    productCode: string;
    name: string;
    typeId: string | null;
    unit: string;
    statusId: string;
    sortOrder: number;
  }): ProductRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      productCode: row.productCode,
      name: row.name,
      typeId: row.typeId,
      unit: row.unit,
      statusId: row.statusId,
      sortOrder: row.sortOrder,
    };
  }

  async listSolutions(workspaceId: string): Promise<SolutionRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.solution.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { solutionCode: "asc" }],
    });
    return rows.map((r) => this.toSolution(r));
  }

  private toSolution(row: {
    id: string;
    workspaceId: string;
    solutionCode: string;
    name: string;
    summary: string | null;
    scenario: string | null;
    status: string;
    sortOrder: number;
  }): SolutionRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      solutionCode: row.solutionCode,
      name: row.name,
      summary: row.summary,
      scenario: row.scenario,
      status: row.status as SolutionRecord["status"],
      sortOrder: row.sortOrder,
    };
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
      optional: r.optional,
      note: r.note,
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

  async setSolutionOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const patch = { sortOrder: o.sortOrder, updatedAt: new Date() };
      const guard = assertWritable(SOLUTION_TABLE, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked solution column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
      await p.solution.updateMany({ where: { workspaceId, id: o.id }, data: patch });
    }
  }

  async removeSolution(workspaceId: string, solutionId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // The items go with it - fk_solution_item_solution cascades.
    const { count } = await p.solution.deleteMany({ where: { workspaceId, id: solutionId } });
    return count > 0;
  }

  async removePrice(workspaceId: string, priceId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // Nothing FKs a price entry - the approval copies the floor rather than
    // pointing at it (ADR-019), which is why the "a signature cites this row"
    // refusal is the SERVICE's to make and cannot be left to the database.
    const { count } = await p.priceBookEntry.deleteMany({ where: { workspaceId, id: priceId } });
    return count > 0;
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
    input: Omit<ProductRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<ProductRecord> {
    const p = await getPrismaClient();
    const update = {
      name: input.name,
      typeId: input.typeId,
      unit: input.unit,
      statusId: input.statusId,
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
    // A new product joins at the END of the catalogue - last place is the one
    // position that is nobody else's decision to give away. Read-then-upsert is
    // not raced in this product's write pattern (one maintainer edits the
    // catalogue), and the unique code key makes the upsert itself safe.
    const tail = await p.product.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });
    const row = await p.product.upsert({
      where: { workspaceId_productCode: { workspaceId, productCode: input.productCode } },
      update,
      create: {
        workspaceId,
        productCode: input.productCode,
        sortOrder: (tail._max?.sortOrder ?? 0) + 1,
        ...update,
      },
    });
    return this.toProduct(row);
  }

  async setProductStatus(
    workspaceId: string,
    productId: string,
    statusId: string,
  ): Promise<ProductRecord | null> {
    const p = await getPrismaClient();
    const patch = { statusId, updatedAt: new Date() };
    const guard = assertWritable(PRODUCT_TABLE, patch);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked product column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const { count } = await p.product.updateMany({
      where: { workspaceId, id: productId },
      data: patch,
    });
    if (count === 0) return null;
    const row = await p.product.findFirst({ where: { workspaceId, id: productId } });
    return row ? this.toProduct(row) : null;
  }

  async setProductOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const patch = { sortOrder: o.sortOrder, updatedAt: new Date() };
      const guard = assertWritable(PRODUCT_TABLE, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked product column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
      await p.product.updateMany({ where: { workspaceId, id: o.id }, data: patch });
    }
  }

  async removeProduct(workspaceId: string, productId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // The service already refused referenced products via planRemoval; the
    // RESTRICT FKs underneath are the last line, not the error path. Prices
    // cascade with their product (fk_price_product).
    const { count } = await p.product.deleteMany({ where: { workspaceId, id: productId } });
    return count > 0;
  }

  async countProductRefs(
    workspaceId: string,
    productId: string,
  ): Promise<{ lines: number; solutionItems: number }> {
    const p = await getPrismaClient();
    const [lines, solutionItems] = await Promise.all([
      p.opportunityLine.count({ where: { workspaceId, productId } }),
      p.solutionItem.count({ where: { workspaceId, productId } }),
    ]);
    return { lines, solutionItems };
  }

  async listProductTypes(workspaceId: string): Promise<ProductTypeRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.productType.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { typeCode: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      typeCode: r.typeCode,
      name: r.name,
      sortOrder: r.sortOrder,
      status: r.status as ProductTypeRecord["status"],
    }));
  }

  async upsertProductType(
    workspaceId: string,
    input: Omit<ProductTypeRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<ProductTypeRecord> {
    const p = await getPrismaClient();
    const update = { name: input.name, status: input.status, updatedAt: new Date() };
    const guard = assertWritable(PRODUCT_TYPE_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked product_type column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const tail = await p.productType.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });
    const row = await p.productType.upsert({
      where: { workspaceId_typeCode: { workspaceId, typeCode: input.typeCode } },
      update,
      create: {
        workspaceId,
        typeCode: input.typeCode,
        sortOrder: (tail._max?.sortOrder ?? 0) + 1,
        ...update,
      },
    });
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      typeCode: row.typeCode,
      name: row.name,
      sortOrder: row.sortOrder,
      status: row.status as ProductTypeRecord["status"],
    };
  }

  async setProductTypeOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const patch = { sortOrder: o.sortOrder, updatedAt: new Date() };
      const guard = assertWritable(PRODUCT_TYPE_TABLE, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked product_type column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
      await p.productType.updateMany({ where: { workspaceId, id: o.id }, data: patch });
    }
  }

  async removeProductType(workspaceId: string, typeId: string): Promise<boolean> {
    const p = await getPrismaClient();
    // The service refused in-use types via planTypeRemoval; fk_product_type
    // RESTRICTs underneath as the last line.
    const { count } = await p.productType.deleteMany({ where: { workspaceId, id: typeId } });
    return count > 0;
  }

  async countProductsByType(workspaceId: string, typeId: string): Promise<number> {
    const p = await getPrismaClient();
    return p.product.count({ where: { workspaceId, typeId } });
  }

  private toStatus(row: {
    id: string;
    workspaceId: string;
    statusCode: string;
    name: string;
    description: string | null;
    sortOrder: number;
  }): ProductStatusRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      statusCode: row.statusCode,
      name: row.name,
      description: row.description,
      sortOrder: row.sortOrder,
    };
  }

  async listStatusConfigs(workspaceId: string): Promise<ProductStatusRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.productStatus.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { statusCode: "asc" }],
    });
    return rows.map((r) => this.toStatus(r));
  }

  async upsertStatusConfig(
    workspaceId: string,
    input: Omit<ProductStatusRecord, "id" | "workspaceId" | "sortOrder">,
  ): Promise<ProductStatusRecord> {
    const p = await getPrismaClient();
    const update = { name: input.name, description: input.description, updatedAt: new Date() };
    const guard = assertWritable(PRODUCT_STATUS_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked product_status column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const tail = await p.productStatus.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });
    const row = await p.productStatus.upsert({
      where: { workspaceId_statusCode: { workspaceId, statusCode: input.statusCode } },
      update,
      create: {
        workspaceId,
        statusCode: input.statusCode,
        sortOrder: (tail._max?.sortOrder ?? 0) + 1,
        ...update,
      },
    });
    return this.toStatus(row);
  }

  async setStatusConfigOrder(
    workspaceId: string,
    orders: readonly { id: string; sortOrder: number }[],
  ): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const patch = { sortOrder: o.sortOrder, updatedAt: new Date() };
      const guard = assertWritable(PRODUCT_STATUS_TABLE, patch);
      if (!guard.ok) {
        throw new Error(
          `refusing to write a locked product_status column: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }
      await p.productStatus.updateMany({ where: { workspaceId, id: o.id }, data: patch });
    }
  }

  async removeStatusConfig(workspaceId: string, statusId: string): Promise<boolean> {
    const p = await getPrismaClient();
    const { count } = await p.productStatus.deleteMany({ where: { workspaceId, id: statusId } });
    return count > 0;
  }

  async countProductsByStatusId(workspaceId: string, statusId: string): Promise<number> {
    const p = await getPrismaClient();
    return p.product.count({ where: { workspaceId, statusId } });
  }

  async upsertSolution(
    workspaceId: string,
    input: Omit<SolutionRecord, "id" | "workspaceId" | "sortOrder">,
    items: readonly Omit<SolutionItemRecord, "id" | "workspaceId" | "solutionId">[],
  ): Promise<SolutionRecord> {
    const p = await getPrismaClient();
    const update = {
      name: input.name,
      summary: input.summary,
      scenario: input.scenario,
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
      const tail = await tx.solution.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
      const row = await tx.solution.upsert({
        where: { workspaceId_solutionCode: { workspaceId, solutionCode: input.solutionCode } },
        update,
        create: {
          workspaceId,
          solutionCode: input.solutionCode,
          sortOrder: (tail._max?.sortOrder ?? 0) + 1,
          ...update,
        },
      });
      await tx.solutionItem.deleteMany({ where: { workspaceId, solutionId: row.id } });
      if (items.length > 0) {
        await tx.solutionItem.createMany({
          data: items.map((i) => ({
            workspaceId,
            solutionId: row.id,
            productId: i.productId,
            quantity: i.quantity,
            optional: i.optional,
            note: i.note,
          })),
        });
      }
      return this.toSolution(row);
    });
  }

  async appendPrice(workspaceId: string, input: PriceDraft): Promise<PriceEntryRecord> {
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
        supersedesId: input.supersedesId ?? null,
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
    supersedesId: string | null;
  }): PriceEntryRecord {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      productId: r.productId,
      currency: r.currency,
      listPrice: num(r.listPrice),
      floorPrice: num(r.floorPrice),
      effectiveAt: r.effectiveAt,
      supersedesId: r.supersedesId,
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
