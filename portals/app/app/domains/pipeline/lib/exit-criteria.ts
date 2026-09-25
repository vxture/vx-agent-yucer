import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { EVIDENCE_SLOTS, type EvidenceSlot } from "./evidence";

// 阶段退出条件 (incr/0087, YC-065 R1): what the current stage should have got
// us, judged against data the product already holds.
//
// THREE ANSWERS, NOT TWO. A criterion is met, unmet, or UNKNOWN - the read it
// needs was refused or failed. Unknown never counts as met ("读不到不是证实")
// and the page says 无法判断 rather than a quiet green.
//
// EVERY MET POINTS AT A RECORD, every unmet says what is missing and where to
// fix it; the page renders those as a sentence and a link, never re-stating
// the detail another panel owns ("1 行待批 -> 报价与审批").

export const EXIT_CRITERION_KINDS = [
  "role_present",
  "role_reached",
  "slot_filled",
  "lines_priced",
  "their_commitments_clear",
  "close_date_valid",
] as const;
export type ExitCriterionKind = (typeof EXIT_CRITERION_KINDS)[number];

/** Roles a criterion may ask for - the ones a buying role can hold. */
export const CRITERION_ROLES = ["economic", "user", "technical", "coach"] as const;

export interface ExitCriterion {
  readonly id: string;
  readonly stageCode: string;
  readonly kind: ExitCriterionKind;
  readonly param: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly sortOrder: number;
}

/** What the evaluation reads. null = that read was refused or failed. */
export interface DealFacts {
  /** People on this deal with their role and last contact on it. */
  readonly people: readonly { readonly role: string; readonly lastContactAt: Date | null }[] | null;
  /** False when who-spoke-when could not be read: "reached" is then unknown, not unmet. */
  readonly recencyKnown?: boolean;
  readonly filledSlots: ReadonlySet<EvidenceSlot> | null;
  readonly lines: { readonly count: number; readonly pending: number } | null;
  readonly theirOverdue: number | null;
  readonly expectedCloseAt: Date | null;
  readonly now: Date;
}

export type CheckStatus = "met" | "unmet" | "unknown";

/** Why - structured, so the page can phrase it and link it. */
export type CheckDetail =
  | { readonly kind: "role_present"; readonly roles: readonly string[]; readonly holders: number }
  | { readonly kind: "role_reached"; readonly roles: readonly string[]; readonly days: number; readonly lastDays: number | null }
  | { readonly kind: "slot_filled"; readonly slot: string }
  | { readonly kind: "lines_priced"; readonly count: number; readonly pending: number }
  | { readonly kind: "their_commitments_clear"; readonly overdue: number }
  | { readonly kind: "close_date_valid"; readonly daysLeft: number | null }
  | { readonly kind: "unreadable" };

export interface CriterionCheck {
  readonly criterion: ExitCriterion;
  readonly status: CheckStatus;
  readonly detail: CheckDetail;
}

const DAY = 86_400_000;
const rolesOf = (c: ExitCriterion): readonly string[] =>
  Array.isArray(c.param.roles) ? (c.param.roles as unknown[]).filter((r): r is string => typeof r === "string") : [];

export function checkCriterion(c: ExitCriterion, f: DealFacts): CriterionCheck {
  const unknown: CriterionCheck = { criterion: c, status: "unknown", detail: { kind: "unreadable" } };
  switch (c.kind) {
    case "role_present": {
      if (!f.people) return unknown;
      const roles = rolesOf(c);
      const holders = f.people.filter((p) => roles.length === 0 || roles.includes(p.role)).length;
      return { criterion: c, status: holders > 0 ? "met" : "unmet", detail: { kind: "role_present", roles, holders } };
    }
    case "role_reached": {
      if (!f.people || f.recencyKnown === false) return unknown;
      const roles = rolesOf(c);
      const days = typeof c.param.days === "number" ? c.param.days : 30;
      const last = f.people
        .filter((p) => roles.length === 0 || roles.includes(p.role))
        .map((p) => p.lastContactAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const lastDays = last ? Math.floor((f.now.getTime() - last.getTime()) / DAY) : null;
      return {
        criterion: c,
        status: lastDays !== null && lastDays <= days ? "met" : "unmet",
        detail: { kind: "role_reached", roles, days, lastDays },
      };
    }
    case "slot_filled": {
      if (!f.filledSlots) return unknown;
      const slot = String(c.param.slot ?? "");
      return {
        criterion: c,
        status: f.filledSlots.has(slot as EvidenceSlot) ? "met" : "unmet",
        detail: { kind: "slot_filled", slot },
      };
    }
    case "lines_priced": {
      if (!f.lines) return unknown;
      return {
        criterion: c,
        status: f.lines.count > 0 && f.lines.pending === 0 ? "met" : "unmet",
        detail: { kind: "lines_priced", count: f.lines.count, pending: f.lines.pending },
      };
    }
    case "their_commitments_clear": {
      if (f.theirOverdue === null) return unknown;
      return {
        criterion: c,
        status: f.theirOverdue === 0 ? "met" : "unmet",
        detail: { kind: "their_commitments_clear", overdue: f.theirOverdue },
      };
    }
    case "close_date_valid": {
      const daysLeft = f.expectedCloseAt
        ? Math.floor((Date.UTC(f.expectedCloseAt.getUTCFullYear(), f.expectedCloseAt.getUTCMonth(), f.expectedCloseAt.getUTCDate()) -
            Date.UTC(f.now.getUTCFullYear(), f.now.getUTCMonth(), f.now.getUTCDate())) / DAY)
        : null;
      return {
        criterion: c,
        status: daysLeft !== null && daysLeft >= 0 ? "met" : "unmet",
        detail: { kind: "close_date_valid", daysLeft },
      };
    }
  }
}

export interface StageCheck {
  readonly checks: readonly CriterionCheck[];
  readonly met: number;
  /** Criteria configured for the stage - 0 means "本阶段未设退出条件", never "all met". */
  readonly total: number;
}

/** Every criterion of one stage, in their order. */
export function checkStage(stageCode: string, criteria: readonly ExitCriterion[], f: DealFacts): StageCheck {
  const mine = criteria.filter((c) => c.stageCode === stageCode).sort((a, b) => a.sortOrder - b.sortOrder);
  const checks = mine.map((c) => checkCriterion(c, f));
  return { checks, met: checks.filter((c) => c.status === "met").length, total: checks.length };
}

/** Validate a criterion's kind and param before it is written. */
export function planCriterion(input: {
  readonly kind: string;
  readonly param: unknown;
  readonly name: string;
}): RuleResult<{ kind: ExitCriterionKind; param: Record<string, unknown>; name: string }> {
  const name = input.name.trim();
  if (!name) return fail(violation("name_required", "a criterion needs the sentence the page shows", "name"));
  if (name.length > 255) return fail(violation("name_too_long", "a criterion name is at most 255 characters", "name"));
  if (!(EXIT_CRITERION_KINDS as readonly string[]).includes(input.kind)) {
    return fail(violation("criterion_kind_unknown", `no criterion kind ${input.kind}`, "kind"));
  }
  const kind = input.kind as ExitCriterionKind;
  const p = (input.param && typeof input.param === "object" ? input.param : {}) as Record<string, unknown>;
  type Planned = { kind: ExitCriterionKind; param: Record<string, unknown>; name: string };
  const bad = (): RuleResult<Planned> =>
    fail(violation("criterion_param_invalid", `the parameters do not fit ${kind}`, "param"));
  if (kind === "role_present" || kind === "role_reached") {
    const roles = p.roles;
    if (!Array.isArray(roles) || roles.some((r) => !(CRITERION_ROLES as readonly string[]).includes(String(r)))) return bad();
    if (kind === "role_reached") {
      if (roles.length === 0 || typeof p.days !== "number" || !Number.isInteger(p.days) || p.days < 1 || p.days > 365) return bad();
      return ok({ kind, param: { roles: [...roles], days: p.days }, name });
    }
    return ok({ kind, param: { roles: [...roles] }, name });
  }
  if (kind === "slot_filled") {
    if (!(EVIDENCE_SLOTS as readonly string[]).includes(String(p.slot))) return bad();
    return ok({ kind, param: { slot: p.slot }, name });
  }
  return ok({ kind, param: {}, name });
}

// --- Facts from raw reads, and the journal's snapshot (deal batch 5b) ---------------

/**
 * The facts a check reads, from the reads the caller already made - ONE
 * function, so the deal page and the stage change (which snapshots the check
 * into the journal) cannot build them differently. null in = null out: a
 * refused read stays unknown.
 */
export function dealFactsFrom(input: {
  /** The deal's chain people, or null when the chain could not be read. */
  readonly people: readonly { readonly decisionRole: string; readonly lastContactAt: Date | null }[] | null;
  readonly recencyKnown: boolean;
  readonly filledSlots: ReadonlySet<EvidenceSlot> | null;
  readonly lines: readonly { readonly needsApproval: boolean; readonly approved: boolean }[] | null;
  readonly commitments: readonly { readonly direction: string; readonly status: string; readonly dueAt: Date }[] | null;
  readonly expectedCloseAt: Date | null;
  readonly now: Date;
}): DealFacts {
  return {
    people: input.people ? input.people.map((p) => ({ role: p.decisionRole, lastContactAt: p.lastContactAt })) : null,
    recencyKnown: input.recencyKnown,
    filledSlots: input.filledSlots,
    lines: input.lines
      ? { count: input.lines.length, pending: input.lines.filter((l) => l.needsApproval && !l.approved).length }
      : null,
    theirOverdue: input.commitments
      ? input.commitments.filter((c) => c.direction === "they_owe" && c.status === "open" && c.dueAt < input.now).length
      : null,
    expectedCloseAt: input.expectedCloseAt,
    now: input.now,
  };
}

/**
 * What the stage LEFT looked like when the deal left it (incr/0088): the
 * criteria by NAME at that moment, so renaming or deleting one later does not
 * rewrite what the journal says was checked.
 */
export interface ExitSnapshot {
  readonly stage: string;
  readonly met: readonly string[];
  readonly unmet: readonly string[];
  readonly unknown: readonly string[];
}

export function snapshotOf(stage: string, check: StageCheck): ExitSnapshot {
  const names = (s: CheckStatus) => check.checks.filter((c) => c.status === s).map((c) => c.criterion.name);
  return { stage, met: names("met"), unmet: names("unmet"), unknown: names("unknown") };
}
