export const STRATEGY_THEMES = ["focus", "expand", "innovate", "partner", "diversify"] as const;
export type StrategyTheme = typeof STRATEGY_THEMES[number];

export interface StrategyType {
  /** Historical publication snapshots can predate type UUIDs. */
  id?: string;
  code: string;
  name: string;
  description: string;
  theme: StrategyTheme;
  enabled: boolean;
  sortOrder: number;
}

// Ansoff's growth directions plus ecosystem cooperation. A type expresses
// intent, not a score, approval status, or an inferred company classification.
export const DEFAULT_STRATEGY_TYPES: readonly StrategyType[] = [
  {code:"market-depth",name:"\u5e02\u573a\u6df1\u8015",description:"\u805a\u7126\u6838\u5fc3\u5e02\u573a\uff0c\u63d0\u5347\u5ba2\u6237\u8986\u76d6\u4e0e\u7ecf\u8425\u6df1\u5ea6",theme:"focus",enabled:true,sortOrder:0},
  {code:"market-expansion",name:"\u5e02\u573a\u5f00\u62d3",description:"\u8fdb\u5165\u65b0\u533a\u57df\u3001\u65b0\u884c\u4e1a\u6216\u65b0\u5ba2\u7fa4",theme:"expand",enabled:true,sortOrder:1},
  {code:"product-innovation",name:"\u4ea7\u54c1\u521b\u65b0",description:"\u4ee5\u65b0\u4ea7\u54c1\u65b9\u6848\u6253\u5f00\u5ba2\u6237\u4ef7\u503c\u7a7a\u95f4",theme:"innovate",enabled:true,sortOrder:2},
  {code:"ecosystem",name:"\u751f\u6001\u534f\u540c",description:"\u8054\u5408\u6e20\u9053\u4e0e\u4f19\u4f34\uff0c\u5171\u540c\u62d3\u5c55\u5e02\u573a",theme:"partner",enabled:true,sortOrder:3},
  {code:"diversification",name:"\u591a\u5143\u5e03\u5c40",description:"\u63a2\u7d22\u65b0\u4e1a\u52a1\u4e0e\u65b0\u5e02\u573a\u7684\u589e\u957f\u7ec4\u5408",theme:"diversify",enabled:true,sortOrder:4},
].map((type, index) => ({ ...type, theme: type.theme as StrategyTheme, id: defaultStrategyTypeId(index) }));

export function defaultStrategyTypeId(index: number): string {
  return `436fef18-9a87-4d87-bcd7-${String(index + 1).padStart(12, "0")}`;
}

export function validStrategyType(value: StrategyType): boolean {
  return typeof value?.code === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value.code)
    && typeof value.name === "string" && value.name.trim().length > 0 && value.name.trim().length <= 64
    && typeof value.description === "string" && value.description.trim().length <= 240
    && STRATEGY_THEMES.includes(value.theme) && typeof value.enabled === "boolean"
    && Number.isSafeInteger(value.sortOrder) && value.sortOrder >= 0 && value.sortOrder <= 9999;
}
