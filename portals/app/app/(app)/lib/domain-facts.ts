// What a domain home says that no module page says.
//
// A domain home exists only for a domain holding TWO OR MORE routes (see
// functional-domains.ts for the rule). Its content is therefore the fact that
// lives BETWEEN those routes - the thing neither page can state alone, because
// each owns one half of it:
//
//   armory    /strategy knows how the market is cut; /catalog knows what we
//             sell. Neither knows that a product has no price, or that a cut
//             of the market matches nobody.
//   recon     /signal knows what came in; /campaign knows what we aimed.
//             Neither knows how much arrived and stopped.
//   position  /account knows who owes what; /pipeline knows which deals closed.
//             Neither knows what is owed across both.
//
// Counts, not messages, on the same reasoning as the notification bell: each
// number is the current size of something, recomputed per render, and each
// links to the page where it can be acted on. A fact that cannot be acted on
// does not earn a row.
//
// EVERY figure comes from a gated service, and a refusal reads as absent
// rather than zero - a domain home must not become a side channel reporting
// the size of work its reader may not see. That is the same rule the bell
// follows, and the reason `value` is nullable rather than defaulted to 0.

export interface DomainFact {
  /** Key into DOMAIN_FACT_LABEL. */
  readonly key: string;
  /** Null when the read was refused: absent, not zero. */
  readonly value: number | null;
  /** Where the fact is acted on. */
  readonly href: string;
  /**
   * True when this number is something to deal with rather than merely a size.
   * The interface leans on it: a backlog reads as a warning, an inventory
   * reads as plain. Zero is never a warning, whatever the fact.
   */
  readonly attention: boolean;
}

export function fact(
  key: string,
  value: number | null,
  href: string,
  attention = false,
): DomainFact {
  return { key, value, href, attention: attention && (value ?? 0) > 0 };
}

/** Refused reads drop out entirely; the rest keep their order. */
export function visibleFacts(facts: readonly DomainFact[]): DomainFact[] {
  return facts.filter((f) => f.value !== null);
}
