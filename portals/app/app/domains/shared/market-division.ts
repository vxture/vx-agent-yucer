/* 大区 - how a workspace divides its market.
 *
 * FIVE DIVISIONS, PRESET AND EDITABLE (owner, 2026-09-07). The authority is the
 * database: `yucer_core.market_division` and its province mapping, seeded by
 * incr/0036 and writable by the tenant afterwards. A 大区 is a SALES STRUCTURE,
 * not a fact of geography - two workspaces can divide the same country
 * differently and both be right - so it cannot live in the build.
 *
 * WHAT THIS FILE IS: the same preset, for the in-memory store the demo runs on,
 * which has no database behind it. It is NOT a second source of truth -
 * market-division.test.ts parses incr/0036 and fails if the two disagree, in
 * either direction. The one that must be right is the SQL.
 *
 * NOT `account.region`. That column carries the older 华东 / 华北 grouping and
 * TERRITORY ROUTING matches on it (incr/0017); the two are different questions
 * and incr/0036 says why they coexist.
 */

export interface MarketDivision {
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
}

export const MARKET_DIVISIONS: readonly MarketDivision[] = [
  { code: "east", name: "东部", sortOrder: 1 },
  { code: "south", name: "南部", sortOrder: 2 },
  { code: "west", name: "西部", sortOrder: 3 },
  { code: "north", name: "北部", sortOrder: 4 },
  { code: "central", name: "中部", sortOrder: 5 },
];

/** Province -> division code. Every one of the 34 is placed. */
export const MARKET_DIVISION_PROVINCES: Readonly<Record<string, string>> = {
  // 东部
  辽宁省: "east", 北京市: "east", 天津市: "east", 河北省: "east",
  山东省: "east", 江苏省: "east", 上海市: "east", 浙江省: "east",
  福建省: "east", 台湾省: "east",
  // 南部
  广东省: "south", 广西壮族自治区: "south", 海南省: "south",
  香港特别行政区: "south", 澳门特别行政区: "south",
  // 西部
  四川省: "west", 重庆市: "west", 贵州省: "west", 云南省: "west",
  西藏自治区: "west", 陕西省: "west", 甘肃省: "west", 青海省: "west",
  宁夏回族自治区: "west", 新疆维吾尔自治区: "west",
  // 北部
  内蒙古自治区: "north", 山西省: "north", 吉林省: "north", 黑龙江省: "north",
  // 中部
  河南省: "central", 湖北省: "central", 湖南省: "central",
  安徽省: "central", 江西省: "central",
};
