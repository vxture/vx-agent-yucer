import type { Citation } from "../../domains/judgement/lib/judgement";

/**
 * Put a person's name on each citation's actor (polish, 2026-09-24): the
 * evidence drawer printed "48 天前 · 电话 usr_demo_m010". The rule layer has
 * no member directory; every page that shows evidence already reads one.
 * An actor the directory does not know keeps its id.
 */
export function nameCitations(
  citations: readonly Citation[],
  nameOf: (sub: string) => string | null | undefined,
): Citation[] {
  return citations.map((c) => {
    const name = c.actorSub ? nameOf(c.actorSub) : null;
    return name ? { ...c, actorName: name } : c;
  });
}
