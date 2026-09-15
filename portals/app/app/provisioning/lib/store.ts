// Persistence port for the provisioning webhook (idempotency + seq + instance
// state). In-memory for the offline path; Prisma-backed over vx_provision when
// DATABASE_URL is set. Importing PrismaProvisioningStore is safe on the offline
// path - it only `import type`s @prisma/client and loads it lazily.
import { prismaEnabled } from "../../lib/db";
import { PrismaProvisioningStore } from "./prisma-store";

export interface DeliveryMeta {
  type: string;
  result: string;
}

/** One recorded delivery, as /api/platform-check lists it (newest first). */
export interface RecentDelivery {
  deliveryId: string;
  type: string;
  result: string;
  receivedAt: Date;
}

export interface ProvisioningStore {
  isDelivered(deliveryId: string): Promise<boolean>;
  markDelivered(deliveryId: string, meta?: DeliveryMeta): Promise<void>;
  getLastSeq(workspaceId: string, product: string): Promise<number>;
  setSeq(workspaceId: string, product: string, seq: number): Promise<void>;
  upsertInstance(workspaceId: string, product: string, status: string): Promise<void>;
  /** The most recent deliveries, newest first - the self-proof surface's C3-down evidence. */
  recentDeliveries(limit: number): Promise<RecentDelivery[]>;
}

export class InMemoryProvisioningStore implements ProvisioningStore {
  private delivered = new Set<string>();
  private log: RecentDelivery[] = [];
  private seq = new Map<string, number>();
  private instances = new Map<string, string>();

  /**
   * NUL as the separator, written as the escape - see authz/store.ts for the
   * same key and the same reason. A workspace id and a product code cannot
   * contain U+0000, so no two pairs collide; a raw byte here would make this
   * file binary to grep, which is how the twin in authz went unfound.
   */
  private seqKey(w: string, p: string) {
    return `${w}\0${p}`;
  }

  async isDelivered(id: string): Promise<boolean> {
    return this.delivered.has(id);
  }
  async markDelivered(id: string, meta?: DeliveryMeta): Promise<void> {
    this.delivered.add(id);
    this.log.push({ deliveryId: id, type: meta?.type ?? "unknown", result: meta?.result ?? "processed", receivedAt: new Date() });
    if (this.log.length > 100) this.log.shift(); // a ring, not a history
  }
  async recentDeliveries(limit: number): Promise<RecentDelivery[]> {
    return this.log.slice(-limit).reverse();
  }
  async getLastSeq(w: string, p: string): Promise<number> {
    return this.seq.get(this.seqKey(w, p)) ?? -1;
  }
  async setSeq(w: string, p: string, s: number): Promise<void> {
    this.seq.set(this.seqKey(w, p), s);
  }
  async upsertInstance(w: string, p: string, status: string): Promise<void> {
    this.instances.set(this.seqKey(w, p), status);
  }
}

let override: ProvisioningStore | null = null;
let memo: ProvisioningStore | null = null;

export function getProvisioningStore(): ProvisioningStore {
  if (override) return override;
  if (memo) return memo;
  memo = prismaEnabled() ? new PrismaProvisioningStore() : new InMemoryProvisioningStore();
  return memo;
}

/** Tests inject a fresh store; pass null to clear. */
export function setProvisioningStore(next: ProvisioningStore | null): void {
  override = next;
  memo = null;
}
