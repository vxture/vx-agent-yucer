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

/* ---------------------------------------------------------------------------
 * 系统配置 (templates) - the divisions we ship, as something to START from.
 *
 * TWO OF THEM, because both are standard ways to carve China and neither is
 * more correct: the five-way 东南西北中, and the seven-way 华北/东北/华东/华中/
 * 华南/西南/西北 that this repo's territory routing already speaks.
 *
 * THEY ARE TEMPLATES, NOT A LAYER THE TENANT SITS ON TOP OF. Importing one
 * MATERIALISES rows into the workspace; nothing afterwards points back here.
 * That costs about forty tiny rows per tenant and buys the thing the pointer
 * design would lose: `market_division_province`'s primary key is what
 * guarantees a province is in AT MOST ONE 大区, and it can only guarantee that
 * over rows it actually holds. Merge a shared preset with tenant overrides and
 * that invariant moves from Postgres into application code - which is the one
 * guarantee every figure grouped by 大区 depends on.
 *
 * 系统 / 自定义 IS DERIVED, not stored. A division is "system" when it still
 * matches the template it came from, exactly; the moment a tenant renames it or
 * moves a province, it stops matching and reads as custom - with no column to
 * keep in step and no way for the label to drift from the truth.
 */

export interface DivisionTemplate {
  readonly key: string;
  readonly divisions: readonly MarketDivision[];
  readonly provinces: Readonly<Record<string, string>>;
}

/** 七分法 - the grouping territory routing already matches on. */
const SEVEN_DIVISIONS: readonly MarketDivision[] = [
  { code: "north", name: "华北", sortOrder: 1 },
  { code: "northeast", name: "东北", sortOrder: 2 },
  { code: "east", name: "华东", sortOrder: 3 },
  { code: "central", name: "华中", sortOrder: 4 },
  { code: "south", name: "华南", sortOrder: 5 },
  { code: "southwest", name: "西南", sortOrder: 6 },
  { code: "northwest", name: "西北", sortOrder: 7 },
];

const SEVEN_PROVINCES: Readonly<Record<string, string>> = {
  北京市: "north", 天津市: "north", 河北省: "north", 山西省: "north", 内蒙古自治区: "north",
  辽宁省: "northeast", 吉林省: "northeast", 黑龙江省: "northeast",
  上海市: "east", 江苏省: "east", 浙江省: "east", 安徽省: "east",
  福建省: "east", 江西省: "east", 山东省: "east", 台湾省: "east",
  河南省: "central", 湖北省: "central", 湖南省: "central",
  广东省: "south", 广西壮族自治区: "south", 海南省: "south",
  香港特别行政区: "south", 澳门特别行政区: "south",
  重庆市: "southwest", 四川省: "southwest", 贵州省: "southwest",
  云南省: "southwest", 西藏自治区: "southwest",
  陕西省: "northwest", 甘肃省: "northwest", 青海省: "northwest",
  宁夏回族自治区: "northwest", 新疆维吾尔自治区: "northwest",
};

export const DIVISION_TEMPLATES: readonly DivisionTemplate[] = [
  { key: "five", divisions: MARKET_DIVISIONS, provinces: MARKET_DIVISION_PROVINCES },
  { key: "seven", divisions: SEVEN_DIVISIONS, provinces: SEVEN_PROVINCES },
];

/**
 * Is this division exactly as some template ships it?
 *
 * Compared on NAME AND PROVINCE SET, not on code alone: a workspace that keeps
 * the code and re-carves the ground has customised it, and saying otherwise
 * would label a tenant's own decision as ours.
 */
export function isSystemDivision(
  code: string, name: string, provinces: readonly string[],
): boolean {
  const mine = [...provinces].sort();
  return DIVISION_TEMPLATES.some((t) => {
    const d = t.divisions.find((x) => x.code === code);
    if (!d || d.name !== name) return false;
    const theirs = Object.entries(t.provinces)
      .filter(([, c]) => c === code).map(([p]) => p).sort();
    return theirs.length === mine.length && theirs.every((p, i) => p === mine[i]);
  });
}
