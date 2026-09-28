// 复盘底稿 - the rule half (YC-065 R7, YC-069 section 09, deal batch 12).
//
// "由声明日志、阶段日志、承诺、决策链、折扣签字合成四段——在哪开始滑、谁没
// 兑现、覆盖缺谁、让了几轮". Each section carries the records it was built
// from, so the card can open every line to its source; the 参谋's narrative is
// written over this and never replaces it. Nothing here chooses a reason code
// - "原因码不预选".

const DAY = 86_400_000;
const CATEGORY_RANK: Record<string, number> = { commit: 3, best_case: 2, pipeline: 1, closed: 4 };
/** The roles a won deal usually needed; a missing one is worth naming in a review. */
const EXPECTED_ROLES = ["economic", "technical", "coach"] as const;
/** Not in a follow-up for this long before the close: cold at the end. */
const COLD_DAYS = 30;

export interface SlipEvent {
  readonly at: string;
  readonly field: "expected_close_at" | "amount" | "forecast_category" | "probability";
  readonly from: string | null;
  readonly to: string | null;
}

export interface ReviewDraft {
  /** 在哪开始滑: every change for the worse, oldest first, and the stage the first one happened in. */
  readonly slip: { readonly firstAt: string | null; readonly stageThen: string | null; readonly events: readonly SlipEvent[] };
  /** 谁没兑现: promises not kept by the close - still open, missed, or met late. */
  readonly promises: readonly { readonly id: string; readonly direction: string; readonly statement: string; readonly dueAt: string; readonly state: "open" | "missed" | "late" }[];
  /** 覆盖缺谁: roles never on the chain, and people gone cold before the close. */
  readonly coverage: { readonly missingRoles: readonly string[]; readonly cold: readonly { readonly name: string; readonly role: string; readonly lastDays: number | null }[] };
  /** 让了几轮: discount signatures, and every cut to the amount. */
  readonly concessions: { readonly rounds: number; readonly signatures: readonly { readonly at: string; readonly product: string; readonly belowFloor: number }[]; readonly cuts: readonly SlipEvent[] };
}

/** A claim change that made the deal look worse. */
function isWorse(e: { field: string; fromValue: string | null; toValue: string | null }): boolean {
  if (e.fromValue === null || e.toValue === null) return false;
  switch (e.field) {
    case "expected_close_at":
      return e.toValue > e.fromValue;
    case "amount":
    case "probability":
      return Number(e.toValue) < Number(e.fromValue);
    case "forecast_category":
      return (CATEGORY_RANK[e.toValue] ?? 0) < (CATEGORY_RANK[e.fromValue] ?? 0);
    default:
      return false;
  }
}

export function reviewDraft(input: {
  readonly closedAt: Date;
  readonly claims: readonly { readonly field: string; readonly fromValue: string | null; readonly toValue: string | null; readonly occurredAt: Date }[];
  readonly stageEvents: readonly { readonly toStage: string; readonly occurredAt: Date }[];
  /** Stage code to its name. */
  readonly stageName: (code: string) => string;
  readonly commitments: readonly { readonly id: string; readonly direction: string; readonly statement: string; readonly dueAt: Date; readonly status: string; readonly metAt: Date | null }[];
  /** The deal's chain people (active), with names. */
  readonly people: readonly { readonly name: string; readonly role: string; readonly lastContactAt: Date | null }[];
  readonly approvals: readonly { readonly product: string; readonly unitPrice: number; readonly floorPrice: number; readonly approvedAt: Date }[];
}): ReviewDraft {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const worse = [...input.claims]
    .filter(isWorse)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((e) => ({ at: day(e.occurredAt), field: e.field as SlipEvent["field"], from: e.fromValue, to: e.toValue, when: e.occurredAt }));
  const first = worse[0];
  const stageAt = (d: Date) =>
    [...input.stageEvents].filter((s) => s.occurredAt <= d).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0]?.toStage ?? null;
  const stageThen = first ? stageAt(first.when) : null;

  const promises = input.commitments
    .map((c) => {
      const state: "open" | "missed" | "late" | null =
        c.status === "open" ? "open" : c.status === "missed" ? "missed" : c.status === "met" && c.metAt && c.metAt > c.dueAt ? "late" : null;
      return state ? { id: c.id, direction: c.direction, statement: c.statement, dueAt: day(c.dueAt), state } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  const roles = new Set(input.people.map((p) => p.role));
  const lastDays = (d: Date | null) => (d ? Math.max(0, Math.floor((input.closedAt.getTime() - d.getTime()) / DAY)) : null);
  const cold = input.people
    .map((p) => ({ name: p.name, role: p.role, lastDays: lastDays(p.lastContactAt) }))
    .filter((p) => p.lastDays === null || p.lastDays > COLD_DAYS);

  const strip = ({ when: _w, ...e }: (typeof worse)[number]): SlipEvent => e;
  return {
    slip: { firstAt: first?.at ?? null, stageThen: stageThen ? input.stageName(stageThen) : null, events: worse.map(strip) },
    promises,
    coverage: { missingRoles: EXPECTED_ROLES.filter((r) => !roles.has(r)), cold },
    concessions: {
      rounds: input.approvals.length,
      signatures: [...input.approvals]
        .sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime())
        .map((a) => ({ at: day(a.approvedAt), product: a.product, belowFloor: Math.round((a.floorPrice - a.unitPrice) * 100) / 100 })),
      cuts: worse.filter((e) => e.field === "amount").map(strip),
    },
  };
}
