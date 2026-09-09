import { ALL_PROVINCES, provinceTag } from "../../domains/shared/provinces";
import { PRESET_MEMBERSHIP } from "../../domains/shared/market-division";
import type { ProvinceOption } from "../components/division-form";

/* What the 大区 province picker draws for each of the 34.
 *
 * HERE RATHER THAN IN EITHER PAGE because both the create and the edit page
 * need exactly this list, and the one thing worse than a long option builder is
 * two of them: the second copy is where the preset hint quietly stops matching
 * the carve the first one shows.
 */
export function provinceOptions(
  /** province -> the 大区 that holds it now. */
  heldBy: ReadonlyMap<string, string>,
): readonly ProvinceOption[] {
  return ALL_PROVINCES.map((province) => ({
    province,
    heldBy: heldBy.get(province) ?? null,
    /* `JS 江苏` (owner, 2026-09-08). Two LATIN letters, not two Chinese
       characters: the letters are GB/T 2260's own codes - the thing anyone
       matching this carve against another system matches on - and a column of
       latin ahead of the names makes 34 rows scannable in a way 34 Chinese
       words are not. */
    tag: provinceTag(province),
    five: PRESET_MEMBERSHIP.five?.[province] ?? "",
    seven: PRESET_MEMBERSHIP.seven?.[province] ?? "",
  }));
}
