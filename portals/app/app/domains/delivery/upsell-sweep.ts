import type { PermCode } from "../../authz/catalog";
import { canRunAdvisor } from "../copilot/lib/advisor-gate";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getAccountStore, getCatalogStore, getCopilotStore, getDeliveryStore } from "../shared/registry";
import { recordProposals } from "../copilot/service";
import { UPSELL_ACTION_TYPE } from "../copilot/lib/action";
import type { NewProposal } from "../copilot/store";
import { ownedProducts } from "./lib/contract";
import { upsellCandidates, whitespace, type PeerHolding, type UpsellCandidate } from "./lib/whitespace";

// The upsell sweep (L4 batch six) - a scheduled job, like the commitment
// sweep beside it (owner, 2026-09-22: 定时任务).
//
// IT PROPOSES, NEVER SELLS. Each candidate becomes an agent_action in the
// queue that already exists, where a person reads the counts and decides
// (ADR-003). Nothing about the account or its contracts changes.
//
// RULE-BASED, NO MODEL (owner, 2026-09-22): the candidates come from
// lib/whitespace.ts - 白地 minus nothing, ranked by how many same-industry
// peers run the product. Confidence is that share (owner's choice), and the
// rationale states the counts so it can be checked.
//
// NOT EVERY DAY, THE SAME ADVICE. A proposal still waiting, or one a person
// REJECTED in the last 90 days, is not filed again - a sweep that re-asked
// every morning after a "no" would teach people to stop reading the queue.
// The commitment sweep re-asks after a rejection on purpose (a broken
// promise stays broken); an unwanted product recommendation does not.

export const UPSELL_SUBJECT = "svc:upsell-sweep";
export const UPSELL_PERMISSIONS: readonly PermCode[] = ["copilot.use"];
export { UPSELL_ACTION_TYPE };
export const UPSELL_CAPABILITY = "account.upsell";
/** At most this many proposals per account per run - the best-supported. */
export const UPSELL_PER_ACCOUNT = 2;
const REJECTION_MEMORY_DAYS = 90;
const DAY = 86_400_000;

export interface UpsellLedger {
  accountsConsidered: number;
  proposed: number;
  alreadyQueued: number;
  /** Workspaces the entitlement gate refused. Counted, never omitted. */
  skipped: number;
  /** Workspaces whose catalogue was empty or unreadable - 白地 unknown. */
  unknownCatalogue: number;
  failed: number;
}

export async function runUpsellSweep(options: {
  workspaces: readonly { workspaceId: string }[];
  now?: Date;
}): Promise<UpsellLedger> {
  const now = options.now ?? new Date();
  const resolver = getEntitlementResolver();
  const holder = { permissions: new Set(UPSELL_PERMISSIONS) };
  const ledger: UpsellLedger = {
    accountsConsidered: 0,
    proposed: 0,
    alreadyQueued: 0,
    skipped: 0,
    unknownCatalogue: 0,
    failed: 0,
  };

  for (const ws of options.workspaces) {
    try {
      const entitlement = await resolver.resolve(ws.workspaceId);
      // Gated on the capability's host feature (YC-042), not on a tier of its
      // own: customer management has its upsell advisor at every tier.
      if (!canRunAdvisor(holder, entitlement, UPSELL_CAPABILITY).allowed) {
        ledger.skipped += 1;
        continue;
      }

      const catalog = getCatalogStore();
      const [contracts, accounts, products, statuses] = await Promise.all([
        getDeliveryStore().listContracts(ws.workspaceId),
        getAccountStore().listAccounts(ws.workspaceId, {}),
        catalog.listProducts(ws.workspaceId),
        catalog.listStatusConfigs(ws.workspaceId),
      ]);
      const active = new Set(statuses.filter((s) => s.statusCode === "active").map((s) => s.id));
      const sellable = products.filter((p) => active.has(p.statusId));
      const nameOf = new Map(products.map((p) => [p.id, p.name]));
      if (sellable.length === 0) {
        ledger.unknownCatalogue += 1;
        continue;
      }

      // 已购态 per account, from the same rule the contract tab uses.
      const byAccount = new Map<string, typeof contracts>();
      for (const c of contracts) byAccount.set(c.accountId, [...(byAccount.get(c.accountId) ?? []), c]);
      const holdings: PeerHolding[] = accounts.map((a) => ({
        accountId: a.id,
        industryId: a.industryId,
        owned: new Set(ownedProducts(byAccount.get(a.id) ?? [], now).map((o) => o.productId)),
      }));

      const copilot = getCopilotStore();
      const [pending, rejected] = await Promise.all([
        copilot.listProposals(ws.workspaceId, { status: "proposed" }),
        copilot.listProposals(ws.workspaceId, { status: "rejected" }),
      ]);
      const blocked = new Set(
        [...pending, ...rejected.filter((r) => r.decidedAt && now.getTime() - r.decidedAt.getTime() <= REJECTION_MEMORY_DAYS * DAY)]
          .filter((p) => p.actionType === UPSELL_ACTION_TYPE)
          .map((p) => `${p.subjectId}|${String((p.payload as { productId?: unknown }).productId)}`),
      );

      const drafts: NewProposal[] = [];
      for (const h of holdings) {
        // Only customers already running something: 白地 is about the
        // installed base, not about prospects with no contract at all.
        if (h.owned.size === 0) continue;
        ledger.accountsConsidered += 1;
        const space = whitespace(sellable.map((p) => p.id), h.owned);
        const candidates = upsellCandidates({ accountId: h.accountId, industryId: h.industryId }, space, holdings);
        let filed = 0;
        for (const c of candidates) {
          if (filed >= UPSELL_PER_ACCOUNT) break;
          if (blocked.has(`${h.accountId}|${c.productId}`)) {
            ledger.alreadyQueued += 1;
            continue;
          }
          drafts.push(proposalFor(h.accountId, c, nameOf.get(c.productId) ?? c.productId));
          filed += 1;
        }
      }
      if (drafts.length === 0) continue;

      const result = await recordProposals(
        { workspaceId: ws.workspaceId, sub: UPSELL_SUBJECT, holder, entitlement, store: copilot },
        drafts,
      );
      if (!result.ok) {
        ledger.skipped += 1;
        continue;
      }
      ledger.proposed += result.value.length;
    } catch {
      ledger.failed += 1;
    }
  }
  return ledger;
}

function proposalFor(accountId: string, c: UpsellCandidate, productName: string): NewProposal {
  return {
    sessionId: null,
    actionType: UPSELL_ACTION_TYPE,
    capability: UPSELL_CAPABILITY,
    subjectType: "account",
    subjectId: accountId,
    payload: { productId: c.productId, productName, owners: c.owners, peers: c.peers, accountId },
    // The counts, not an adjective. A reader can check "7 of 12" against the
    // book; "strong fit" they can only take on trust.
    rationale: `Not yet running ${productName}. ${c.owners} of ${c.peers} same-industry customers with an in-force contract run it.`,
    // The peer share, as the owner ruled (2026-09-22). Unlike the commitment
    // sweep's null, this is a measured rate, not a rule claiming certainty.
    confidence: Math.round(c.rate * 100),
  };
}
