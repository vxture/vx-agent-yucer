import { activeDomainFromPath } from "./functional-domains";
import type { BoardSection } from "./board";

// The menu filter, kept OUT of board.ts.
//
// board.ts is a server module - it reads cookies through the message bundle and
// touches the stores - and nav-board.tsx is a client component. Importing the
// filter from there dragged the whole server module into the client bundle and
// the build died on `Can't resolve 'fs'`. The rule is not "small files": it is
// that a client component may only import from modules a browser can run, and
// this one is pure.
//
// The TYPE still comes from board.ts, which is free - types are erased.

/**
 * The menu for where you are standing.
 *
 * INSIDE A DOMAIN it is that domain's own cards - its judgement cards and its
 * modules - plus the crosscutting ones. OUTSIDE ONE (the home stream) it is
 * the map: one row per domain, which is how you choose a section to enter.
 *
 * The map rows disappear once you are inside a section, because their whole
 * job was getting you there; keeping them would put the choice you already
 * made back in front of you on every page of the product.
 */
export function menuFor(
  sections: readonly BoardSection[],
  pathname: string,
): BoardSection[] {
  const here = activeDomainFromPath(pathname);
  if (!here) return sections.filter((s) => s.isMap || s.domain === null);
  return sections.filter((s) => !s.isMap && (s.domain === here || s.domain === null));
}
