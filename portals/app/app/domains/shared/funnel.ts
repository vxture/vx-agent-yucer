import { FUNNEL_STAGES, type FunnelStage } from "./funnel-exit";

// 漏斗总览 - the whole chain in one reading (design_yucer_110 batch E).
//
// WHAT NO EXISTING PAGE COULD SAY. Each stage has its own module and each one
// answers about itself; nothing answered "this batch of demand came in, where
// did it get to, and where did it leak". That question is cross-stage by
// construction, which is why the exit reasons went into one table (incr/0033)
// rather than three columns on five tables.
//
// COUNTS, NOT MONEY. A signal has no amount and a lead has no amount, so a
// value-weighted funnel could only start at the opportunity - and a funnel
// that silently begins two stages in is worse than one that counts things.
// Money is what the forecast and the collection modules are for.
//
// THIS IS ARITHMETIC OVER FACTS, not an estimate. Every number is a count of
// rows in a state the database already holds; nothing here predicts.

export interface StageInput {
  /** Still somebody's to work: not moved on, not ended. */
  readonly open: number;
  /** Moved on to the next stage. */
  readonly advanced: number;
  /** Ended here, whatever the reason. */
  readonly exited: number;
}

export interface ExitInput {
  readonly stage: FunnelStage;
  readonly reasonCode: string;
}

export interface StageReading {
  readonly stage: FunnelStage;
  readonly open: number;
  readonly advanced: number;
  readonly exited: number;
  /** open + advanced + exited - everything that ever reached this stage. */
  readonly reached: number;
  /**
   * advanced / reached, or null when nothing reached it.
   *
   * NULL IS NOT ZERO. "Nothing has got this far" and "everything that got here
   * died" are opposite readings, and a page showing 0% for both would report a
   * healthy empty funnel as a catastrophe.
   */
  readonly passRate: number | null;
  /** Why the ones that ended here ended, commonest first. */
  readonly reasons: readonly { readonly code: string; readonly count: number }[];
  /**
   * Ended here with nothing saying why.
   *
   * THE PAGE'S OWN BLIND SPOT, counted rather than hidden. Only some stages
   * have a surface that asks for a reason; the rest still write a status and
   * nothing else, and a funnel that quietly showed "no reasons" for those would
   * read as "nothing went wrong there".
   */
  readonly unexplained: number;
}

export interface FunnelReading {
  readonly stages: readonly StageReading[];
  /** Everything that entered the funnel at all. */
  readonly entered: number;
  /** How much of it is still alive somewhere. */
  readonly live: number;
  /** The stage that lost the most, or null when nothing has ended anywhere. */
  readonly biggestLeak: StageReading | null;
}

export function readFunnel(
  byStage: Readonly<Record<FunnelStage, StageInput>>,
  exits: readonly ExitInput[],
): FunnelReading {
  const stages = FUNNEL_STAGES.map((stage) => {
    const s = byStage[stage];
    const reached = s.open + s.advanced + s.exited;

    const counts = new Map<string, number>();
    for (const e of exits) {
      if (e.stage !== stage) continue;
      counts.set(e.reasonCode, (counts.get(e.reasonCode) ?? 0) + 1);
    }
    const reasons = [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.code.localeCompare(b.code)));

    const explained = reasons.reduce((n, r) => n + r.count, 0);

    return {
      stage,
      open: s.open,
      advanced: s.advanced,
      exited: s.exited,
      reached,
      passRate: reached === 0 ? null : s.advanced / reached,
      reasons,
      // CLAMPED AT ZERO. More exit rows than exited subjects is possible - a
      // correction is a new row (incr/0033 is append-only) - and a negative
      // "unexplained" would be arithmetic leaking into the reading.
      unexplained: Math.max(s.exited - explained, 0),
    };
  });

  const ended = stages.filter((s) => s.exited > 0);
  return {
    stages,
    // THE FIRST STAGE'S `reached`, not the sum: a lead that came from a signal
    // is the same piece of demand counted twice, and adding the stages up would
    // report every conversion as new business.
    entered: stages[0]?.reached ?? 0,
    live: stages.reduce((n, s) => n + s.open, 0),
    biggestLeak:
      ended.length === 0
        ? null
        : /* SEEDED WITH ended[0] rather than relying on the no-seed form. The
             empty case is already guarded above, so the no-seed version could
             not actually throw - but "it cannot be empty because of a ternary
             three lines up" is a fact about this file today, not a property of
             the call. Seeding makes the call safe on its own terms. */
          ended.slice(1).reduce(
            (worst, s) => (s.exited > worst.exited ? s : worst),
            ended[0],
          ),
  };
}
