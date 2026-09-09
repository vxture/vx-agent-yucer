import { provinceFrame, type MarketScope } from "../../domains/shared/market-division";
import type { Dictionary } from "./i18n/dictionary";

/* The three sentences every 区域设置 screen builds from the frame, in one
 * place: what a region is made of (省份 / 市 / 区), how the frame reads
 * (陕西省 · 包括为市级), and what the frame is called (中国市场 / 陕西省). A
 * carve's name is not here - it is a column of yucer_ref.market_carve.
 * Four pages and two components read these; one copy each was how the noun
 * drifted between them.
 */

/** 省份 under 中国市场; 市 or 区 under a province frame, by its unit. */
export function frameNoun(scope: MarketScope, T: Dictionary["PLANNING_TEXT"]): string {
  if (scope.kind === "province") {
    const unit = provinceFrame(scope.code)?.unit ?? "city";
    return T.unitNoun[unit] ?? unit;
  }
  return T.memberNoun[scope.kind] ?? scope.kind;
}

/** 全国市场 · 包括为省级 / 陕西省 · 包括为市级 / 北京市 · 包括为区级 */
export function frameIncludes(scope: MarketScope, T: Dictionary["PLANNING_TEXT"]): string {
  if (scope.kind === "province") {
    const f = provinceFrame(scope.code);
    return T.scopeIncludesProvince(f?.province ?? scope.code ?? "", frameNoun(scope, T));
  }
  return T.scopeIncludes[scope.kind] ?? scope.kind;
}

/** The frame's own name for the page: 中国市场 / 陕西省. */
export function frameName(scope: MarketScope, T: Dictionary["PLANNING_TEXT"]): string {
  if (scope.kind === "province") return provinceFrame(scope.code)?.province ?? scope.code ?? "";
  return T.scopeLabel[scope.kind] ?? scope.kind;
}
