// 智探的判断 - what the scout notices about a pile of signals that a person
// reading them one row at a time cannot (design_yucer_110 batch D).
//
// EVERY FUNCTION HERE PROPOSES AND STOPS. Nothing is applied: a duplicate is
// marked by a person, an account is matched by a person, a cluster is only ever
// a reading. That is ADR-003, and it matters more here than almost anywhere
// else in the product - these three inferences are all guesses from a company
// NAME, and a name is not an identity (ADR-024).
//
// THE ALTERNATIVE WAS FUZZY MATCHING, and it is refused on purpose. Levenshtein
// over Chinese company names would link 华东零售集团 to 华南零售集团, and that
// mistake is invisible until somebody has worked the wrong customer for a
// month. What is used instead is VERBATIM CONTAINMENT plus a refusal to guess
// when two candidates both fit - it finds less and is wrong less often, and
// what it misses a person can still do by hand.
//
// WHAT `subject` ACTUALLY HOLDS shaped all three. It is a HEADLINE - "华东零售
// 集团正在评估 POS 替换方案" - not a company name, which is why matching looks
// inside it and why clustering does not group on it at all. Worth knowing:
// planPromotion copies `subject` into a lead's `company_name`, so promoting a
// signal today names the lead after a whole sentence. That is a real
// inconsistency in the product and it is NOT fixed here.

export interface ScoutSignal {
  readonly id: string;
  readonly subject: string;
  readonly signalType: string;
  readonly accountId: string | null;
  readonly detectedAt: Date;
  readonly status: string;
}

export interface ScoutAccount {
  readonly id: string;
  readonly name: string;
}

/**
 * The comparison key for a company name.
 *
 * WHITESPACE AND CASE ONLY. It does NOT strip 有限公司 / 集团 / Co., Ltd: those
 * are part of a legal entity's name, and two entities in one group differ by
 * exactly that suffix. Removing it would merge a subsidiary into its parent,
 * which is the mistake ADR-024 exists to prevent one level up.
 */
export function nameKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/** Signals that are still somebody's to judge. */
const isOpen = (s: ScoutSignal) => s.status === "new" || s.status === "scored";

const DAY_MS = 86_400_000;

/**
 * Two signals are the same event if they are about the same company, of the
 * same type, and close together in time.
 *
 * FOURTEEN DAYS, and it is a stated convention rather than a measurement. Two
 * tender notices for one company three months apart are two tenders; two on
 * consecutive days are one, reported twice. The window has to be short enough
 * that a real second event is not swallowed and long enough that a feed
 * replaying overnight is caught - and there is no way to derive that number,
 * so it is named here where it can be argued with.
 */
const SAME_EVENT_DAYS = 14;

export interface DuplicateProposal {
  /** The one to keep - the earliest, because it is the first report. */
  readonly keepId: string;
  /** The later report of the same event. */
  readonly duplicateId: string;
  readonly subject: string;
  readonly daysApart: number;
}

/**
 * Which open signals look like a second report of one somebody already has.
 *
 * THE EARLIEST IS KEPT, always. It is the first time this was noticed, so its
 * detection time is the true one - and the decay in the score is measured from
 * that moment. Keeping the newer one would quietly reset the clock on an old
 * event.
 */
export function findDuplicates(signals: readonly ScoutSignal[]): DuplicateProposal[] {
  const open = signals.filter(isOpen);
  const groups = new Map<string, ScoutSignal[]>();
  for (const s of open) {
    // MATCHED SIGNALS GROUP BY ACCOUNT, unmatched ones by their text. Two
    // signals on the same account are about the same company even when the
    // reports are worded differently - and for unmatched ones, two identically
    // worded reports are exactly what a duplicate is, so grouping on the
    // headline is right HERE even though it is useless for clustering.
    const key = `${s.accountId ?? nameKey(s.subject)}::${s.signalType}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const out: DuplicateProposal[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
    const keep = ordered[0];
    for (const later of ordered.slice(1)) {
      const daysApart = Math.round(
        (later.detectedAt.getTime() - keep.detectedAt.getTime()) / DAY_MS,
      );
      if (daysApart > SAME_EVENT_DAYS) continue;
      out.push({
        keepId: keep.id,
        duplicateId: later.id,
        subject: later.subject,
        daysApart,
      });
    }
  }
  return out;
}

export interface AccountMatchProposal {
  readonly signalId: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly subject: string;
}

/**
 * Unmatched signals whose text NAMES an existing customer.
 *
 * THIS IS THE UPSTREAM OF TWO OTHER REFUSALS. An unmatched signal becomes an
 * unmatched lead, which has no region - so 智能分配 cannot place it - and no
 * account, so it cannot convert. Both of those dead ends start here.
 *
 * CONTAINMENT, NOT EQUALITY, and the reason is what `subject` actually holds.
 * It is a HEADLINE - "华东零售集团正在评估 POS 替换方案" - not a company name,
 * so comparing it whole to a customer's name finds nothing, ever. An earlier
 * version of this function did exactly that and would have shipped a feature
 * that could not fire.
 *
 * STILL NOT FUZZY. Containment asks whether the customer's name appears in the
 * report verbatim; edit distance would link 华东零售集团 to 华南零售集团, and
 * that mistake is invisible until somebody has worked the wrong customer for a
 * month. What containment misses, a person can still do by hand.
 *
 * AMBIGUITY IS REFUSED, NOT RANKED - and containment makes it likelier, which
 * is why the guard matters more here than it would for equality. 华东零售 is
 * contained in a headline that also contains 华东零售集团, so both customers
 * match and neither is proposed: choosing the longer one would be a heuristic
 * nobody asked for, and choosing either is a coin toss the reader cannot see.
 */
export function proposeAccountMatches(
  signals: readonly ScoutSignal[],
  accounts: readonly ScoutAccount[],
): AccountMatchProposal[] {
  // Empty names cannot be searched for: "" is contained in everything, so an
  // account with a blank name would match every signal in the inbox.
  const named = accounts.filter((a) => nameKey(a.name) !== "");

  return signals.flatMap((s) => {
    if (!isOpen(s) || s.accountId !== null) return [];
    const haystack = nameKey(s.subject);
    const hits = named.filter((a) => haystack.includes(nameKey(a.name)));
    if (hits.length !== 1) return [];
    return [
      {
        signalId: s.id,
        accountId: hits[0].id,
        accountName: hits[0].name,
        subject: s.subject,
      },
    ];
  });
}

export interface SignalCluster {
  readonly key: string;
  readonly subject: string;
  readonly accountId: string | null;
  readonly signalIds: readonly string[];
  readonly types: readonly string[];
}

/**
 * Companies that several open signals point at.
 *
 * THREE SIGNALS ABOUT ONE COMPANY ARE NOT THREE SIGNALS. A tender notice, a
 * funding round and a hiring push about the same firm are one story, and the
 * inbox - which is ordered by per-signal score - cannot say so: each row is
 * judged against a number that knows nothing about its neighbours.
 *
 * IT DOES NOT RESCORE ANYTHING. The cluster is a reading offered beside the
 * queue, not an adjustment to it. Folding "how many others" into the score
 * would put a company with four weak signals above one with a live tender, and
 * the score's whole definition is how likely THIS signal is to be real.
 *
 * ONLY MATCHED SIGNALS TAKE PART - see the grouping below.
 *
 * DISTINCT TYPES ONLY in `types`: the same event reported twice is a duplicate
 * (above), and counting it as breadth would make a noisy feed look like a story.
 */
export function clusterByCompany(signals: readonly ScoutSignal[]): SignalCluster[] {
  // BY ACCOUNT ONLY. `subject` is a headline, so grouping unmatched signals by
  // it would only ever join two reports worded identically - which is a
  // duplicate, not a story. An unmatched signal has no reliable identity to
  // cluster on, and that is precisely why matching it comes first.
  const groups = new Map<string, ScoutSignal[]>();
  for (const s of signals.filter(isOpen)) {
    if (s.accountId === null) continue;
    groups.set(s.accountId, [...(groups.get(s.accountId) ?? []), s]);
  }

  return [...groups.entries()]
    .filter(([, g]) => g.length >= 2)
    .map(([key, g]) => ({
      key,
      subject: g[0].subject,
      accountId: g[0].accountId,
      signalIds: g.map((s) => s.id),
      types: [...new Set(g.map((s) => s.signalType))].sort(),
    }))
    // Most signals first, ties broken on the key so two runs agree.
    .sort((a, b) =>
      b.signalIds.length !== a.signalIds.length
        ? b.signalIds.length - a.signalIds.length
        : a.key.localeCompare(b.key),
    );
}
