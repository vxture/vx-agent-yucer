import { ALL_PROVINCES, shortProvince } from "../../domains/shared/provinces";
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
    /* TWO CHARACTERS, taken off the short name rather than the full one:
       蒙 / 黑 style one-character plate codes are unreadable in a list of 34,
       and 内蒙古自治区 in a fixed prefix column would push every full name out
       of alignment. The full name sits right beside it, so the prefix only has
       to be scannable, not sufficient on its own. */
    short: shortProvince(province).slice(0, 2),
    five: PRESET_MEMBERSHIP.five?.[province] ?? "",
    seven: PRESET_MEMBERSHIP.seven?.[province] ?? "",
  }));
}
