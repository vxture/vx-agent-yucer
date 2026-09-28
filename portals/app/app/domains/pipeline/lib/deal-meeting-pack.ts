// 商机会前包 - the rule half (YC-066 S6, YC-070 "商机会前包", deal batch 11a).
//
// "一次生成：到场角色与立场、未兑现承诺、本次会议目标（下一阶段首条未满足
// 条件），每项可链回". Everything here is a fact the deal page already holds,
// arranged for the meeting; the 参谋's half (agenda, per-person talk track,
// objections, questions) is written over it and admitted separately.
//
// THE GOAL: what the deal needs to move on - the current stage's first
// criterion not yet met (unmet or unjudgeable), since that is what stands
// between it and the next stage; when all of those are met, the next stage's
// first criterion. None when neither stage has criteria set - the pack does
// not invent a goal the workspace did not define.

const DAY = 86_400_000;

export interface MeetingAttendee {
  readonly contactId: string;
  readonly name: string;
  readonly title: string | null;
  /** The role on THIS deal; null = in the chain with no role recorded. */
  readonly role: string | null;
  readonly stance: string | null;
  readonly lastContactAt: Date | null;
}

export interface DealMeetingPack {
  readonly attendees: readonly (Omit<MeetingAttendee, "lastContactAt"> & { readonly lastDays: number | null })[];
  readonly promises: readonly {
    readonly id: string;
    readonly direction: string;
    readonly statement: string;
    readonly dueAt: string;
    /** Negative = overdue by that many days. */
    readonly daysToDue: number;
  }[];
  readonly goal: { readonly criterion: string; readonly stage: string; readonly from: "current" | "next" } | null;
}

export function buildDealMeetingPack(input: {
  readonly attendees: readonly MeetingAttendee[];
  readonly commitments: readonly { readonly id: string; readonly direction: string; readonly status: string; readonly statement: string; readonly dueAt: Date }[];
  readonly current: { readonly stage: string; readonly checks: readonly { readonly name: string; readonly status: "met" | "unmet" | "unknown" }[] } | null;
  readonly next: { readonly stage: string; readonly criteria: readonly string[] } | null;
  readonly now: Date;
}): DealMeetingPack {
  const days = (d: Date) => Math.floor((d.getTime() - input.now.getTime()) / DAY);
  const firstOpen = input.current?.checks.find((c) => c.status !== "met");
  const goal = firstOpen
    ? { criterion: firstOpen.name, stage: input.current!.stage, from: "current" as const }
    : input.next && input.next.criteria.length > 0
      ? { criterion: input.next.criteria[0]!, stage: input.next.stage, from: "next" as const }
      : null;
  return {
    attendees: input.attendees.map(({ lastContactAt, ...a }) => ({
      ...a,
      lastDays: lastContactAt ? Math.max(0, -days(lastContactAt)) : null,
    })),
    promises: input.commitments
      .filter((c) => c.status === "open")
      .map((c) => ({ id: c.id, direction: c.direction, statement: c.statement, dueAt: c.dueAt.toISOString().slice(0, 10), daysToDue: days(c.dueAt) }))
      .sort((a, b) => a.daysToDue - b.daysToDue),
    goal,
  };
}
