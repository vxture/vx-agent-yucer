import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 商机阶段的词表 - incr/0057. Same nature as win-loss-vocab.ts/industry-vocab.ts:
// SEED DATA, not copy - a delivered tenant is a usable product, and the
// workspace owns the seven rows (renames, reorders, re-prices, extends)
// afterwards. incr/0057's own seed carries these exact codes/names/
// probabilities/order/flags, which is what makes them data rather than UI
// copy this repo's CJK containment guard is otherwise about.

export interface StageDefinition {
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  /** 0-100. Fixed at 100 for `isWon` rows and 0 for any other `isTerminal`
   *  row (the DDL's own CHECK constraints hold the same line) - only an open
   *  stage's default is actually tenant-editable. */
  readonly defaultProbability: number;
  readonly isWon: boolean;
  /** Implies isWon OR "lost" in the old vocabulary's terms - the DDL's
   *  chk_stage_definition_won_terminal keeps isWon narrower than isTerminal. */
  readonly isTerminal: boolean;
}

/** The shipped seven - unchanged codes/names/probabilities/order/flags, now
 *  data's shape instead of four separate module constants. This is the
 *  fallback every catalog-aware function in stage.ts defaults to, and what
 *  incr/0057 seeds verbatim for every existing workspace. */
export const DEFAULT_STAGE_DEFINITIONS: readonly StageDefinition[] = [
  { code: "qualify", name: "合格判定", sortOrder: 1, defaultProbability: 10, isWon: false, isTerminal: false },
  { code: "discover", name: "需求挖掘", sortOrder: 2, defaultProbability: 25, isWon: false, isTerminal: false },
  { code: "validate", name: "方案验证", sortOrder: 3, defaultProbability: 50, isWon: false, isTerminal: false },
  { code: "propose", name: "报价投标", sortOrder: 4, defaultProbability: 70, isWon: false, isTerminal: false },
  { code: "negotiate", name: "商务谈判", sortOrder: 5, defaultProbability: 90, isWon: false, isTerminal: false },
  { code: "won", name: "赢单", sortOrder: 6, defaultProbability: 100, isWon: true, isTerminal: true },
  { code: "lost", name: "丢单", sortOrder: 7, defaultProbability: 0, isWon: false, isTerminal: true },
];

export interface StageDefinitionDraft {
  code: string;
  name: string;
  defaultProbability: number;
  isWon: boolean;
  isTerminal: boolean;
}

/**
 * A stage a tenant wants to add or rename.
 *
 * The terminal/probability coupling mirrors the DDL's own CHECK constraints
 * (chk_stage_definition_won_probability / _lost_probability) - refused here,
 * in the rule layer's own words, ahead of the raw constraint violation the
 * database would otherwise throw.
 */
export function planStageDefinition(input: StageDefinitionDraft): RuleResult<StageDefinitionDraft> {
  if (!input.code.trim()) {
    return fail(violation("code_required", "a stage needs a code", "code"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a stage needs a name", "name"));
  }
  if (!Number.isInteger(input.defaultProbability) || input.defaultProbability < 0 || input.defaultProbability > 100) {
    return fail(violation("probability_range", "probability must be an integer 0-100", "defaultProbability"));
  }
  if (input.isWon && !input.isTerminal) {
    return fail(violation("won_must_be_terminal", "a won stage is always terminal", "isTerminal"));
  }
  if (input.isWon && input.defaultProbability !== 100) {
    return fail(violation("won_probability_fixed", "a won stage is fixed at 100%", "defaultProbability"));
  }
  if (input.isTerminal && !input.isWon && input.defaultProbability !== 0) {
    return fail(violation("lost_probability_fixed", "a terminal, non-won stage is fixed at 0%", "defaultProbability"));
  }
  return ok({ ...input, code: input.code.trim(), name: input.name.trim() });
}

/**
 * A stage a tenant wants to retire. Refused, cleanly, ahead of the raw FK
 * error the database would otherwise throw (incr/0058's ON DELETE RESTRICT).
 *
 * TWO INVARIANTS BEYOND "IS ANYTHING USING IT" (the FK's own job): a
 * workspace must always have at least one is_won stage and at least one
 * other is_terminal stage, or statusFor can never produce "won"/"lost"
 * again for it. Checked even at zero usage - the FK alone cannot see this,
 * because an unused stage still being the workspace's ONLY won/lost flag
 * bearer is not a foreign-key violation, it is a catalog left with no way to
 * ever close a deal.
 */
export function planStageRemoval(
  opportunitiesOnStage: number,
  removing: StageDefinition,
  catalog: readonly StageDefinition[],
): RuleResult<true> {
  if (opportunitiesOnStage > 0) {
    return fail(violation("stage_in_use", `${opportunitiesOnStage} opportunity(ies) are on this stage`, "stageCode"));
  }
  if (removing.isWon && catalog.filter((s) => s.isWon).length <= 1) {
    return fail(violation("last_won_stage", "a workspace needs at least one won stage", "stageCode"));
  }
  if (removing.isTerminal && !removing.isWon && catalog.filter((s) => s.isTerminal && !s.isWon).length <= 1) {
    return fail(violation("last_lost_stage", "a workspace needs at least one lost stage", "stageCode"));
  }
  return ok(true);
}
