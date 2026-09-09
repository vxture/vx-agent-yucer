import type { DivisionTemplate, MarketMember } from "../../domains/shared/market-division";
import type { MemberOption } from "../components/division-form";

/* What the 大区 member picker draws for each member of the frame's ground -
 * each of the 34 provinces under 中国市场, each of 陕西's ten cities under its
 * own frame.
 *
 * HERE RATHER THAN IN EITHER PAGE because both the create and the edit page
 * need exactly this list, and the one thing worse than a long option builder is
 * two of them: the second copy is where the preset hint quietly stops matching
 * the carve the first one shows.
 */
export function memberOptions(
  /** The carves of this frame, from yucer_ref.market_carve (incr/0047). */
  carves: readonly DivisionTemplate[],
  ground: readonly MarketMember[],
  /** member key -> the 大区 that holds it now. */
  heldBy: ReadonlyMap<string, string>,
  hint: (from: string, name: string) => string,
): readonly MemberOption[] {
  /* THE HINT IS WHAT EVERY SHIPPED CARVE OF THIS FRAME SAYS about the member -
     五分法 中部 · 七分法 华中 for a province, 陕西三分法 关中 for a city. The
     by-unit carve says nothing worth a hint (西安 sits in 西安). A hint, not
     a constraint: nothing refuses a selection that disagrees. */
  return ground.map((m) => ({
    key: m.key,
    /* `JS 江苏` (owner, 2026-09-08) for a province: two LATIN letters ahead of
       the name make 34 rows scannable in a way 34 Chinese words are not. A
       city has no standard letters, so its tag is its short name. */
    label: m.label,
    abbr: m.abbr,
    name: m.name,
    adcode: m.adcode,
    heldBy: heldBy.get(m.key) ?? null,
    hint: carves
      .map((t) => {
        const code = t.members[m.key];
        const d = code ? t.divisions.find((x) => x.code === code) : null;
        return d && !t.key.endsWith("-units") ? hint(t.name, d.name) : null;
      })
      .filter((x): x is string => x !== null)
      .join(" · "),
  }));
}
