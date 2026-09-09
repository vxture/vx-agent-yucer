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
 * `account.region` NAMES ONE OF THESE. It used to carry a separate seven-way
 * 华东 / 华北 grouping that lived in the build, so territory routing matched on
 * one vocabulary while the screen grouped by another and nothing joined them;
 * since 2026-09-08 the column holds a division NAME from this table and the
 * demo is seeded that way. The two are still different QUESTIONS - a 大区 is
 * how the market is carved, a 辖区 is which team works it, and a team may
 * cover several - which is why territory coverage is a list of these names
 * rather than a foreign key. incr/0036 says why they coexist.
 */

/* ---------------------------------------------------------------------------
 * 市场范围 - the FRAME a workspace carves inside (owner, 2026-09-09; incr/0043).
 *
 * Three kinds, and a division is made of the level one below its frame:
 * 全球市场 of countries, 中国市场 of provinces, 省级市场 of one province's cities.
 * Every workspace today is 中国市场, and that is the only frame whose members
 * this build can carve - the other two are stored, constrained and offered as
 * 未建 until the member table lands on yucer_ref.admin_division.
 *
 * THE CODE CARRIES THE FRAME. CHINA-EAST, not EAST: a code is what an import
 * matches on, and "EAST" alone cannot tell 华东 from the eastern half of 广东.
 * The database CHECKs that a division's code starts with its frame's prefix;
 * `divisionCode()` is the one place the product composes one.
 */
export type MarketScopeKind = "global" | "china" | "province";

export interface MarketScope {
  readonly kind: MarketScopeKind;
  /** The province's two GB/T 2260 letters (GD) - only when kind is province. */
  readonly code: string | null;
}

export const DEFAULT_MARKET_SCOPE: MarketScope = { kind: "china", code: null };

/** The frames, in the order the selector offers them. `open` is which of them
 *  this build can actually carve; the rest are 未建 and not selectable. */
export const MARKET_SCOPES: readonly { readonly kind: MarketScopeKind; readonly open: boolean }[] = [
  { kind: "global", open: false },
  { kind: "china", open: true },
  { kind: "province", open: false },
];

/** `CHINA-` / `GLOBAL-` / `GD-` - the prefix every code in this frame carries. */
export function scopePrefix(scope: MarketScope): string {
  if (scope.kind === "global") return "GLOBAL-";
  if (scope.kind === "china") return "CHINA-";
  return `${scope.code ?? ""}-`;
}

/** The stored code for what a person typed after the prefix: `east` -> CHINA-EAST. */
export function divisionCode(scope: MarketScope, local: string): string {
  return scopePrefix(scope) + local.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
}

/** The half a person types - CHINA-EAST -> EAST. */
export function localCode(scope: MarketScope, code: string): string {
  const prefix = scopePrefix(scope);
  return code.startsWith(prefix) ? code.slice(prefix.length) : code;
}

export interface MarketDivision {
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
}

export const MARKET_DIVISIONS: readonly MarketDivision[] = [
  { code: "CHINA-EAST", name: "东部", sortOrder: 1 },
  { code: "CHINA-SOUTH", name: "南部", sortOrder: 2 },
  { code: "CHINA-WEST", name: "西部", sortOrder: 3 },
  { code: "CHINA-NORTH", name: "北部", sortOrder: 4 },
  { code: "CHINA-CENTRAL", name: "中部", sortOrder: 5 },
];

/** Province -> division code. Every one of the 34 is placed. */
export const MARKET_DIVISION_PROVINCES: Readonly<Record<string, string>> = {
  /* 东部 - the coast from 山东 south. 辽宁/北京/天津/河北 moved to 北部
     (owner, 2026-09-08): they are the northern seaboard and the capital
     region, and a sales organisation reads them with 内蒙古 and the north-east
     rather than with 上海 and 福建. */
  山东省: "CHINA-EAST", 江苏省: "CHINA-EAST", 上海市: "CHINA-EAST", 浙江省: "CHINA-EAST",
  福建省: "CHINA-EAST", 台湾省: "CHINA-EAST",
  // 南部
  广东省: "CHINA-SOUTH", 广西壮族自治区: "CHINA-SOUTH", 海南省: "CHINA-SOUTH",
  香港特别行政区: "CHINA-SOUTH", 澳门特别行政区: "CHINA-SOUTH",
  // 西部
  四川省: "CHINA-WEST", 重庆市: "CHINA-WEST", 贵州省: "CHINA-WEST", 云南省: "CHINA-WEST",
  西藏自治区: "CHINA-WEST", 陕西省: "CHINA-WEST", 甘肃省: "CHINA-WEST", 青海省: "CHINA-WEST",
  宁夏回族自治区: "CHINA-WEST", 新疆维吾尔自治区: "CHINA-WEST",
  // 北部
  辽宁省: "CHINA-NORTH", 北京市: "CHINA-NORTH", 天津市: "CHINA-NORTH", 河北省: "CHINA-NORTH",
  内蒙古自治区: "CHINA-NORTH", 山西省: "CHINA-NORTH", 吉林省: "CHINA-NORTH", 黑龙江省: "CHINA-NORTH",
  // 中部
  河南省: "CHINA-CENTRAL", 湖北省: "CHINA-CENTRAL", 湖南省: "CHINA-CENTRAL",
  安徽省: "CHINA-CENTRAL", 江西省: "CHINA-CENTRAL",
};

/* ---------------------------------------------------------------------------
 * 系统配置 (templates) - the divisions we ship, as something to START from.
 *
 * TWO OF THEM, because both are standard ways to carve China and neither is
 * more correct: the five-way 东南西北中, and the seven-way 华北/东北/华东/华中/
 * 华南/西南/西北. The seven-way is the one this repo's territory routing used
 * to speak from a hard-coded table; it is a template now, chosen or not.
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
  /** Which frame the carve belongs to. Both shipped carves cut 中国市场. */
  readonly scope: MarketScopeKind;
  readonly divisions: readonly MarketDivision[];
  readonly provinces: Readonly<Record<string, string>>;
}

/** 七分法 - the other standard carve. */
const SEVEN_DIVISIONS: readonly MarketDivision[] = [
  { code: "CHINA-NORTH", name: "华北", sortOrder: 1 },
  { code: "CHINA-NORTHEAST", name: "东北", sortOrder: 2 },
  { code: "CHINA-EAST", name: "华东", sortOrder: 3 },
  { code: "CHINA-CENTRAL", name: "华中", sortOrder: 4 },
  { code: "CHINA-SOUTH", name: "华南", sortOrder: 5 },
  { code: "CHINA-SOUTHWEST", name: "西南", sortOrder: 6 },
  { code: "CHINA-NORTHWEST", name: "西北", sortOrder: 7 },
];

const SEVEN_PROVINCES: Readonly<Record<string, string>> = {
  北京市: "CHINA-NORTH", 天津市: "CHINA-NORTH", 河北省: "CHINA-NORTH", 山西省: "CHINA-NORTH", 内蒙古自治区: "CHINA-NORTH",
  辽宁省: "CHINA-NORTHEAST", 吉林省: "CHINA-NORTHEAST", 黑龙江省: "CHINA-NORTHEAST",
  上海市: "CHINA-EAST", 江苏省: "CHINA-EAST", 浙江省: "CHINA-EAST", 安徽省: "CHINA-EAST",
  福建省: "CHINA-EAST", 江西省: "CHINA-EAST", 山东省: "CHINA-EAST", 台湾省: "CHINA-EAST",
  河南省: "CHINA-CENTRAL", 湖北省: "CHINA-CENTRAL", 湖南省: "CHINA-CENTRAL",
  广东省: "CHINA-SOUTH", 广西壮族自治区: "CHINA-SOUTH", 海南省: "CHINA-SOUTH",
  香港特别行政区: "CHINA-SOUTH", 澳门特别行政区: "CHINA-SOUTH",
  重庆市: "CHINA-SOUTHWEST", 四川省: "CHINA-SOUTHWEST", 贵州省: "CHINA-SOUTHWEST",
  云南省: "CHINA-SOUTHWEST", 西藏自治区: "CHINA-SOUTHWEST",
  陕西省: "CHINA-NORTHWEST", 甘肃省: "CHINA-NORTHWEST", 青海省: "CHINA-NORTHWEST",
  宁夏回族自治区: "CHINA-NORTHWEST", 新疆维吾尔自治区: "CHINA-NORTHWEST",
};

export const DIVISION_TEMPLATES: readonly DivisionTemplate[] = [
  { key: "five", scope: "china", divisions: MARKET_DIVISIONS, provinces: MARKET_DIVISION_PROVINCES },
  { key: "seven", scope: "china", divisions: SEVEN_DIVISIONS, provinces: SEVEN_PROVINCES },
];

/**
 * Where each province sits in EVERY shipped carve - the hint the province
 * picker prints beside a name.
 *
 * WHY A PICKER NEEDS IT: carving a market is not a memory test. Somebody
 * building 新疆基地 out of one province, or deciding whether 安徽 belongs with
 * the coast or the middle, is answering a question the standard carves already
 * have an opinion about, and showing both opinions beside the checkbox is the
 * difference between choosing and guessing. It is a HINT, not a constraint:
 * nothing here refuses a selection that disagrees with both.
 *
 * Derived from the templates rather than typed again - a third copy of the
 * mapping is a third chance to be wrong about it.
 */
export const PRESET_MEMBERSHIP: Readonly<Record<string, Readonly<Record<string, string>>>> =
  Object.fromEntries(
    DIVISION_TEMPLATES.map((t) => [
      t.key,
      Object.fromEntries(
        Object.entries(t.provinces).map(([province, code]) => [
          province,
          t.divisions.find((d) => d.code === code)?.name ?? "",
        ]),
      ),
    ]),
  );

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
  const d = DIVISION_TEMPLATES.map((t) => t.divisions.find((x) => x.code === code) ?? null);
  return DIVISION_TEMPLATES.some((t, i) => {
    const shipped = d[i];
    if (!shipped || shipped.name !== name) return false;
    /* COMPARED AS SETS, not as sorted arrays. Sorting to compare needed a
       collation for CJK names that neither side actually depends on - the
       question is only "the same provinces", and order is not part of it. It
       also removes a default .sort(), which orders by UTF-16 code unit and is
       the wrong tool for Chinese even when both sides happen to agree. */
    const mine = new Set(provinces);
    let n = 0;
    for (const [province, c] of Object.entries(t.provinces)) {
      if (c !== code) continue;
      n += 1;
      if (!mine.has(province)) return false;
    }
    return n === mine.size;
  });
}
