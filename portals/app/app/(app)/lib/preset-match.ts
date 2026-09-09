import type { PresetOption } from "../components/division-form";

/* Which preset does 重置预置 restore?
 *
 * THE BUG THIS EXISTS FOR (owner, 2026-09-09). Both national carves ship a
 * CHINA-EAST - 五分法's 东部 and 七分法's 华东 - and the first cut matched on
 * code alone, took the first, and reset a 七分法 华东 to 五分法 东部: two
 * provinces gone, no second option offered, and the confirmation named the
 * wrong carve. A code identifies a region WITHIN a carve; across carves it
 * does not.
 *
 * So: a code held by exactly ONE carve is the answer. A code held by several
 * is AMBIGUOUS every time - the caller asks which carve, with the one whose
 * name matches the region pre-checked as `preferred`, and never chooses on
 * its own: a region damaged by the old behaviour (七分法's roster, a row
 * named 东部) would match 五分法 by name and be reset the wrong way again.
 * No match at all: nothing to reset to.
 */
export type PresetMatch =
  | { readonly kind: "one"; readonly preset: PresetOption }
  | {
      readonly kind: "ambiguous";
      readonly candidates: readonly PresetOption[];
      readonly preferred: PresetOption | null;
    }
  | { readonly kind: "none" };

export function matchPreset(
  presets: readonly PresetOption[],
  code: string,
  name: string,
): PresetMatch {
  const byCode = presets.filter((p) => p.code === code);
  if (byCode.length === 0) return { kind: "none" };
  if (byCode.length === 1) return { kind: "one", preset: byCode[0]! };
  const byName = byCode.filter((p) => p.name === name.trim());
  return { kind: "ambiguous", candidates: byCode, preferred: byName.length === 1 ? byName[0]! : null };
}
