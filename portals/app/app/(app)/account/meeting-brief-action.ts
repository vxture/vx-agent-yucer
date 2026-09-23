"use server";

import { can, type PermissionHolder } from "../../authz/decide";
import { resolveAppSession } from "../lib/session";
import {
  getCopilotStore,
  getDeliveryStore,
  getFieldStore,
} from "../../domains/shared/registry";
import {
  decisionChainsByOpportunity,
  getAccountDetail,
  recomputeHealth,
} from "../../domains/account/service";
import { listCommitments } from "../../domains/account/field-service";
import { listPipeline } from "../../domains/pipeline/service";
import { listProjects, projectView } from "../../domains/delivery/service";
import { listProposals } from "../../domains/copilot/service";
import {
  buildMeetingBrief,
  type AttendeeInput,
  type CommitmentInput,
  type ConclusionInput,
  type InstalmentInput,
  type MeetingBrief,
} from "../../domains/copilot/lib/meeting-brief";
import type { RuleResult } from "../../domains/shared/result";
import type { Entitlement } from "../../entitlement/types";

type Base = { workspaceId: string; sub: string; holder: PermissionHolder; entitlement: Entitlement };

// 会前准备 (L6 batch five). Read-only - it writes nothing.
//
// Gated on copilot.suggest (能力与门控: the brief is a synthesis capability
// and rides the key that already guards the proposal pipeline). Every read
// below is ALSO gated by its owning domain, so a reader who may run the brief
// but not see money gets the brief with the money part `refused`, not the
// money.
//
// The four reads run together, and each settles on its own: a rejected read
// is `failed`, a refused one is `refused`, and neither takes the other three
// down (read model T3).

type Wire<T> = { state: "ok"; value: T } | { state: "refused" } | { state: "failed" };

/** A RuleResult (or a throw) as the brief's three-way part state. */
async function settle<T, U>(read: Promise<RuleResult<T>>, map: (v: T) => U): Promise<Wire<U>> {
  try {
    const r = await read;
    return r.ok ? { state: "ok", value: map(r.value) } : { state: "refused" };
  } catch {
    return { state: "failed" };
  }
}

export type MeetingBriefResult =
  | { ok: true; brief: SerializedBrief }
  | { ok: false; error: string };

/** Dates cross the wire as yyyy-mm-dd; the brief's rule already ran server-side. */
export type SerializedBrief = ReturnType<typeof serialize>;

export async function buildMeetingBriefAction(input: {
  accountId: string;
  attendeeContactIds: string[];
}): Promise<MeetingBriefResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = can(session.authz, session.entitlement, "copilot.suggest", "data");
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  // The attendees are chosen, never inferred - so a brief with none is a
  // brief about nobody, and the form cannot submit one.
  if (input.attendeeContactIds.length === 0) return { ok: false, error: "attendees_required" };

  const base: Base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const accountCtx = { ...base, store: session.stores.account() };
  const now = new Date();

  const detail = await getAccountDetail(accountCtx, input.accountId);
  if (!detail.ok) return { ok: false, error: detail.violations[0]?.code ?? "denied" };
  const chosen = detail.value.contacts.filter((c) => input.attendeeContactIds.includes(c.id));

  const deals = await listPipeline({ ...base, store: session.stores.pipeline() }, { accountId: input.accountId });
  const openDeals = (deals.ok ? deals.value : []).filter((d) => d.status === "open");

  const [chains, commitments, instalments, conclusion] = await Promise.all([
    decisionChainsByOpportunity(
      accountCtx,
      input.accountId,
      openDeals.map((d) => ({ id: d.id, name: d.name })),
    ).catch(() => null),
    settle(
      listCommitments({ ...base, store: getFieldStore() }, { accountId: input.accountId }),
      (rows): CommitmentInput[] =>
        rows.map((c) => ({ id: c.id, direction: c.direction, statement: c.statement, dueAt: c.dueAt, status: c.status })),
    ),
    settle(instalmentsOf(base, input.accountId, now), (rows) => rows),
    settle(conclusionOf(accountCtx, base, input.accountId), (c) => c),
  ]);

  // Roles and stances come from each open deal's chain; a person on no chain
  // is still an attendee, just one whose role nobody has recorded.
  const attendees: AttendeeInput[] = chosen.map((c) => ({
    contactId: c.id,
    name: c.name,
    title: c.title,
    roles:
      chains && chains.ok
        ? chains.value.flatMap((chain) =>
            chain.people
              .filter((p) => p.id === c.id)
              .map((p) => ({ dealName: chain.opportunityName, role: p.decisionRole, stance: p.stance })),
          )
        : [],
  }));

  return {
    ok: true,
    brief: serialize(buildMeetingBrief({ attendees, commitments, instalments, conclusion }, now)),
  };
}

async function instalmentsOf(base: Base, accountId: string, now: Date): Promise<RuleResult<InstalmentInput[]>> {
  const ctx = { ...base, store: getDeliveryStore() };
  const projects = await listProjects(ctx, { accountId });
  if (!projects.ok) return projects as RuleResult<InstalmentInput[]>;
  const views = await Promise.all(projects.value.map((p) => projectView(ctx, p.id, { now })));
  const out: InstalmentInput[] = [];
  for (const v of views) {
    if (!v.ok) return v as RuleResult<InstalmentInput[]>;
    // Hidden below the revenue tier: projectView returns no instalments and
    // null collections. Say refused rather than "no money in the air".
    if (v.value.collections === null) {
      return { ok: false, violations: [{ code: "feature_not_in_tier", message: "revenue view not in tier" }] };
    }
    for (const i of v.value.instalments) {
      const gate = v.value.milestones.find((m) => m.id === i.milestoneId);
      out.push({
        id: i.id,
        label: `${v.value.project.name}${gate ? ` · ${gate.name}` : ""}`,
        status: i.status,
        dueAt: i.dueAt,
        amount: i.plannedAmount.amount,
        currency: i.plannedAmount.currency,
      });
    }
  }
  return { ok: true, value: out };
}

async function conclusionOf(
  accountCtx: Parameters<typeof recomputeHealth>[0],
  base: Base,
  accountId: string,
): Promise<RuleResult<ConclusionInput>> {
  const [health, proposals] = await Promise.all([
    // persist:false - a brief reads the score, it never writes it. Refused
    // for a read-only member, which is then `health: null`, not an error.
    // A THROWN health read is also `health: null` here: the score is one
    // line of this part, and the proposals beside it are still worth showing.
    recomputeHealth(accountCtx, accountId, { persist: false }).catch(
      () => ({ ok: false, violations: [] }) as const,
    ),
    listProposals({ ...base, store: getCopilotStore() }, {
      status: "proposed",
      subjectId: accountId,
    }),
  ]);
  if (!proposals.ok) return proposals as RuleResult<ConclusionInput>;
  const concern = health.ok ? health.value.primaryConcern : null;
  return {
    ok: true,
    value: {
      health: health.ok
        ? {
            score: health.value.score,
            concernCode: concern?.reason.code ?? null,
            concernDays: concern && "days" in concern.reason ? concern.reason.days : undefined,
            concernCount: concern && "count" in concern.reason ? concern.reason.count : undefined,
          }
        : null,
      proposals: proposals.value.map((p) => ({
        id: p.id,
        title: p.actionType,
        rationale: p.rationale,
        confidence: p.confidence,
      })),
    },
  };
}

function serialize(b: MeetingBrief) {
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    attendees: b.attendees,
    commitments:
      b.commitments.state === "ok"
        ? { state: "ok" as const, items: b.commitments.items.map((c) => ({ ...c, dueAt: ymd(c.dueAt)! })) }
        : b.commitments,
    money:
      b.money.state === "ok"
        ? { state: "ok" as const, items: b.money.items.map((i) => ({ ...i, dueAt: ymd(i.dueAt) })) }
        : b.money,
    conclusion: b.conclusion,
  };
}
