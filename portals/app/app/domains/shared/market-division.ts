import { PROVINCE_GROUNDS, type ProvinceGround } from "./province-frames";
import { ALL_PROVINCES, provinceTag, shortProvince } from "./provinces";

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
 * 全球市场 of countries, 中国市场 of provinces, 省级市场 of ONE province's
 * prefecture-level cities (owner: 陕西看市级, not counties). The frame decides
 * what a region can contain, and that is the whole reason it is chosen first.
 *
 * WHICH FRAMES ARE OPEN. 中国市场 always; 省级市场 for the provinces named in
 * PROVINCE_FRAMES - 陕西 is the first, formally (owner, 2026-09-09: 陕西作为
 * 第一个省级支持区域，正式的), and the others arrive one increment at a time
 * with their template; 全球市场 is stored, constrained and offered as 未建.
 *
 * A NATIONAL CODE CARRIES THE FRAME - CHINA-EAST, not EAST: a code is what an
 * import matches on, and "EAST" alone cannot tell 华东 from the eastern half
 * of 广东. A PROVINCE CODE DOES NOT: the province's letters are their own
 * column (market_division.scope_province, 0048), and the code is the unit's
 * adcode or the region's own word - GUANZHONG, YUBEI. `divisionCode()` is
 * the one place the product composes one.
 */
export type MarketScopeKind = "global" | "china" | "province";

export interface MarketScope {
  readonly kind: MarketScopeKind;
  /** The province's two GB/T 2260 letters (GD) - only when kind is province. */
  readonly code: string | null;
}

export const DEFAULT_MARKET_SCOPE: MarketScope = { kind: "china", code: null };

/** The frames, in the order the selector offers them. `open` is which of them
 *  this build can carve at all; a province frame is open only for the
 *  provinces in PROVINCE_FRAMES. */
export const MARKET_SCOPES: readonly { readonly kind: MarketScopeKind; readonly open: boolean }[] = [
  { kind: "global", open: false },
  { kind: "china", open: true },
  { kind: "province", open: true },
];

/**
 * One member of a region: a province under 中国市场, a city under 省级市场.
 * `key` is what the database stores (the province NAME for 0036's table, the
 * six-digit adcode for 0045's); `label` is what the interface prints for it -
 * `JS 江苏`, `西安`.
 */
export interface MarketMember {
  readonly key: string;
  readonly label: string;
}

/**
 * 省级市场 - every provincial-level division with anything below it is a
 * frame (owner, 2026-09-09: 你把全国的都加上吧; 行政区划数据应该先预置完整).
 *
 * THE GROUND COMES FROM THE TABLE. province-frames.ts is generated from
 * yucer_ref.admin_division and lists, for each of the 31, the units a region
 * is made of: prefecture-level cities, or a municipality's districts and
 * counties. 台湾 / 香港 / 澳门 have no rows below them and are not offered.
 *
 * TWO CARVES PER PROVINCE (owner: 省级需要两套). 各市独立 - one region per
 * unit - is derived for all 31. 传统大区分法 is typed here only where a
 * reading everyone in the province recognises exists and I am sure of it;
 * the rest carry none until the owner names theirs. A carve is a claim about
 * a province, and a guessed one is worse than an absent one.
 */
export interface ProvinceFrame extends ProvinceGround {
  readonly traditional: {
    readonly key: string;
    readonly name: string;
    readonly divisions: readonly MarketDivision[];
    /** unit adcode -> division code; every unit placed exactly once. */
    readonly members: Readonly<Record<string, string>>;
  } | null;
}

/**
 * GB/T 2260's filing rows - XX9000 省直辖县级行政区划 (419000 holds 济源), and
 * the four municipalities' 市辖区 / 县 rows - are conventions, not places a
 * region holds. The generator and the store leave them out through this.
 *
 * NAMED, NOT PATTERNED, for the municipal ones: XX0100 is a filing row under
 * 北京 and is 西安 under 陕西, and a pattern that said "XX0100 is pseudo"
 * silently dropped two cities from every province on 2026-09-09 - past a db
 * test that filtered both sides through it. A test that applies the rule
 * under test to its own expectation proves nothing.
 */
const MUNICIPAL_FILING_ROWS = new Set(["110100", "120100", "310100", "500100", "500200"]);
export function isPseudoCity(code: string): boolean {
  return /^\d{2}9000$/.test(code) || MUNICIPAL_FILING_ROWS.has(code);
}

/* CODED BY THE PROVINCE'S OWN WORD - YUBEI, SUNAN, CHUANNAN - not by a
   prefix: the province is a column. The word is what people in the province
   say, so two provinces' "north" never collide (豫北 / 苏北 / 陕北). */
const TRADITIONAL: Readonly<Record<string, ProvinceFrame["traditional"]>> = {
  /* 陕西三分法 - 关中 / 陕北 / 陕南, the carve every reading of the province
     agrees on. 陕北 is 延安 and 榆林, 陕南 is 汉中 安康 商洛, the five cities
     of the Wei valley are 关中. */
  SN: {
    key: "shaanxi-three",
    name: "陕西三分法",
    divisions: [
      { code: "GUANZHONG", name: "关中", sortOrder: 1 },
      { code: "SHAANBEI", name: "陕北", sortOrder: 2 },
      { code: "SHAANNAN", name: "陕南", sortOrder: 3 },
    ],
    members: {
      "610100": "GUANZHONG", "610200": "GUANZHONG", "610300": "GUANZHONG",
      "610400": "GUANZHONG", "610500": "GUANZHONG",
      "610600": "SHAANBEI", "610800": "SHAANBEI",
      "610700": "SHAANNAN", "610900": "SHAANNAN", "611000": "SHAANNAN",
    },
  },
  /* 四川五区 - the province's own 五区协同 (2018): 成都平原 / 川南 / 川东北 /
     攀西 / 川西北. Twenty-one prefecture-level units, each in one. */
  SC: {
    key: "sichuan-five",
    name: "四川五区",
    divisions: [
      { code: "CHENGDUPINGYUAN", name: "成都平原", sortOrder: 1 },
      { code: "CHUANNAN", name: "川南", sortOrder: 2 },
      { code: "CHUANDONGBEI", name: "川东北", sortOrder: 3 },
      { code: "PANXI", name: "攀西", sortOrder: 4 },
      { code: "CHUANXIBEI", name: "川西北", sortOrder: 5 },
    ],
    members: {
      "510100": "CHENGDUPINGYUAN", "510600": "CHENGDUPINGYUAN", "510700": "CHENGDUPINGYUAN",
      "510900": "CHENGDUPINGYUAN", "511100": "CHENGDUPINGYUAN", "511400": "CHENGDUPINGYUAN",
      "511800": "CHENGDUPINGYUAN", "512000": "CHENGDUPINGYUAN",
      "510300": "CHUANNAN", "510500": "CHUANNAN", "511000": "CHUANNAN", "511500": "CHUANNAN",
      "510800": "CHUANDONGBEI", "511300": "CHUANDONGBEI", "511600": "CHUANDONGBEI",
      "511700": "CHUANDONGBEI", "511900": "CHUANDONGBEI",
      "510400": "PANXI", "513400": "PANXI",
      "513200": "CHUANXIBEI", "513300": "CHUANXIBEI",
    },
  },
  /* 河南五分法 - 豫中 / 豫北 / 豫东 / 豫西 / 豫南. 开封 is filed with 豫中 (the
     郑汴 pair), the more common of its two readings; a tenant that reads it as
     豫东 moves it. 济源 sits under 419000 and is not a prefecture. */
  HA: {
    key: "henan-five",
    name: "河南五分法",
    divisions: [
      { code: "YUZHONG", name: "豫中", sortOrder: 1 },
      { code: "YUBEI", name: "豫北", sortOrder: 2 },
      { code: "YUDONG", name: "豫东", sortOrder: 3 },
      { code: "YUXI", name: "豫西", sortOrder: 4 },
      { code: "YUNAN", name: "豫南", sortOrder: 5 },
    ],
    members: {
      "410100": "YUZHONG", "410200": "YUZHONG", "410400": "YUZHONG",
      "411000": "YUZHONG", "411100": "YUZHONG",
      "410500": "YUBEI", "410600": "YUBEI", "410700": "YUBEI",
      "410800": "YUBEI", "410900": "YUBEI",
      "411400": "YUDONG", "411600": "YUDONG",
      "410300": "YUXI", "411200": "YUXI",
      "411300": "YUNAN", "411500": "YUNAN", "411700": "YUNAN",
    },
  },
  /* 广东四分 - 珠三角 / 粤东 / 粤西 / 粤北, the reading every Guangdong plan
     uses (一核一带一区 keeps the same four groups). */
  GD: {
    key: "guangdong-four",
    name: "广东四分",
    divisions: [
      { code: "ZHUSANJIAO", name: "珠三角", sortOrder: 1 },
      { code: "YUEDONG", name: "粤东", sortOrder: 2 },
      { code: "YUEXI", name: "粤西", sortOrder: 3 },
      { code: "YUEBEI", name: "粤北", sortOrder: 4 },
    ],
    members: {
      "440100": "ZHUSANJIAO", "440300": "ZHUSANJIAO", "440400": "ZHUSANJIAO", "440600": "ZHUSANJIAO",
      "441300": "ZHUSANJIAO", "441900": "ZHUSANJIAO", "442000": "ZHUSANJIAO", "440700": "ZHUSANJIAO", "441200": "ZHUSANJIAO",
      "440500": "YUEDONG", "441500": "YUEDONG", "445100": "YUEDONG", "445200": "YUEDONG",
      "440800": "YUEXI", "440900": "YUEXI", "441700": "YUEXI",
      "440200": "YUEBEI", "441600": "YUEBEI", "441400": "YUEBEI", "441800": "YUEBEI", "445300": "YUEBEI",
    },
  },
  /* 江苏三分 - 苏南 / 苏中 / 苏北, the province's own statistical grouping. */
  JS: {
    key: "jiangsu-three",
    name: "江苏三分",
    divisions: [
      { code: "SUNAN", name: "苏南", sortOrder: 1 },
      { code: "SUZHONG", name: "苏中", sortOrder: 2 },
      { code: "SUBEI", name: "苏北", sortOrder: 3 },
    ],
    members: {
      "320100": "SUNAN", "320200": "SUNAN", "320400": "SUNAN", "320500": "SUNAN", "321100": "SUNAN",
      "321000": "SUZHONG", "321200": "SUZHONG", "320600": "SUZHONG",
      "320300": "SUBEI", "320700": "SUBEI", "320800": "SUBEI", "320900": "SUBEI", "321300": "SUBEI",
    },
  },
  /* 湖南四大板块 - 长株潭 / 洞庭湖 / 湘南 / 大湘西, the province's own. */
  HN: {
    key: "hunan-four",
    name: "湖南四大板块",
    divisions: [
      { code: "CHANGZHUTAN", name: "长株潭", sortOrder: 1 },
      { code: "DONGTINGHU", name: "洞庭湖", sortOrder: 2 },
      { code: "XIANGNAN", name: "湘南", sortOrder: 3 },
      { code: "DAXIANGXI", name: "大湘西", sortOrder: 4 },
    ],
    members: {
      "430100": "CHANGZHUTAN", "430200": "CHANGZHUTAN", "430300": "CHANGZHUTAN",
      "430600": "DONGTINGHU", "430700": "DONGTINGHU", "430900": "DONGTINGHU",
      "430400": "XIANGNAN", "431000": "XIANGNAN", "431100": "XIANGNAN",
      "430500": "DAXIANGXI", "431200": "DAXIANGXI", "431300": "DAXIANGXI", "430800": "DAXIANGXI", "433100": "DAXIANGXI",
    },
  },
};

export const PROVINCE_FRAMES: readonly ProvinceFrame[] = PROVINCE_GROUNDS.map((g) => ({
  ...g,
  traditional: TRADITIONAL[g.code] ?? null,
}));

export function provinceFrame(code: string | null): ProvinceFrame | null {
  return PROVINCE_FRAMES.find((f) => f.code === code) ?? null;
}

/** Can this exact frame be carved in this build? */
export function scopeOpen(scope: MarketScope): boolean {
  const frame = MARKET_SCOPES.find((s) => s.kind === scope.kind);
  if (!frame?.open) return false;
  return scope.kind !== "province" || provinceFrame(scope.code) !== null;
}

/**
 * The ground a frame is carved from, as the BUILD knows it: the 34 provinces
 * under 中国市场, a supported province's cities under 省级市场, nothing yet
 * under 全球市场. The in-memory store serves this; the Prisma store reads the
 * same rows from yucer_ref.admin_division, and admin-division.db.test.ts
 * proves the two agree.
 */
export function frameMembers(scope: MarketScope): readonly MarketMember[] {
  if (scope.kind === "china") {
    return ALL_PROVINCES.map((p) => ({ key: p, label: provinceTag(p) }));
  }
  if (scope.kind === "province") {
    return (provinceFrame(scope.code)?.units ?? []).map((u) => ({ key: u.code, label: u.short }));
  }
  return [];
}

/**
 * `CHINA-` / `GLOBAL-` - the prefix a national or global code carries; NONE
 * under a province frame (owner, 2026-09-09: 不要 SN- 前缀，这个 SN 可以单列).
 * There the province's letters are market_division.scope_province, and the
 * code is the unit's own: an adcode (610100) is a national standard and is
 * not to be dressed up, and a traditional region is its own word (GUANZHONG).
 */
export function scopePrefix(scope: MarketScope): string {
  if (scope.kind === "global") return "GLOBAL-";
  if (scope.kind === "china") return "CHINA-";
  return "";
}

/** The shape every code has after its prefix: `^[A-Z0-9][A-Z0-9_]*$` - what
 *  chk_market_division_code_frame (0048) CHECKs. */
export const CODE_BODY = /^[A-Z0-9][A-Z0-9_]*$/;

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
  /** 五分法 / 陕西三分法 / 北京各区独立 - what the dialogs print. Data, like the rest. */
  readonly name: string;
  /** Which frame the carve belongs to, and for a province frame, which province. */
  readonly scope: MarketScopeKind;
  readonly province: string | null;
  readonly divisions: readonly MarketDivision[];
  /** member key -> division code. Province NAMES under 中国市场, city adcodes
   *  under 省级市场 - the same keys the member tables store. */
  readonly members: Readonly<Record<string, string>>;
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

/* 各市独立 - one region per unit (owner, 2026-09-09: 省级需要两套，一个是传统
 * 大区分法，一个是各市独立，几个市几个区域). DERIVED from the frame's ground:
 * ten cities make ten regions, in GB/T 2260 order, named by the unit's short
 * name and CODED BY ITS ADCODE, bare - 610100 (owner: 行政区划代码全国有标准,
 * 不要 SN- 前缀). The table carries no romanised city names (0038 refused to
 * fabricate them), and the adcode is the one key anything importing this
 * carve would match on anyway. */
function byUnitTemplate(frame: ProvinceFrame): DivisionTemplate {
  return {
    key: `${frame.code.toLowerCase()}-units`,
    name: `${shortProvince(frame.province)}${frame.unit === "district" ? "各区独立" : "各市独立"}`,
    scope: "province",
    province: frame.code,
    divisions: frame.units.map((u, i) => ({
      code: u.code, name: u.short, sortOrder: i + 1,
    })),
    members: Object.fromEntries(frame.units.map((u) => [u.code, u.code])),
  };
}

/* THE MIRROR OF yucer_ref.market_carve (incr/0047) for the store that has no
 * table to read. NOT a second source of truth: market-carve.db.test.ts reads
 * the table and fails if the two disagree in either direction, and the
 * service reads carves through the store, never from here. */
export const DIVISION_TEMPLATES: readonly DivisionTemplate[] = [
  { key: "five", name: "五分法", scope: "china", province: null, divisions: MARKET_DIVISIONS, members: MARKET_DIVISION_PROVINCES },
  { key: "seven", name: "七分法", scope: "china", province: null, divisions: SEVEN_DIVISIONS, members: SEVEN_PROVINCES },
  /* THE TRADITIONAL CARVE FIRST WHERE THERE IS ONE, then one region per unit -
     like the two per country, neither more correct: a distributor with three
     area managers wants the first, one with a rep in every city the second. */
  ...PROVINCE_FRAMES.flatMap((f) => [
    ...(f.traditional
      ? [{ key: f.traditional.key, name: f.traditional.name, scope: "province" as const, province: f.code,
          divisions: f.traditional.divisions, members: f.traditional.members }]
      : []),
    byUnitTemplate(f),
  ]),
];

/** The carves that cut THIS frame - and nothing from another one. */
export function templatesFor(
  templates: readonly DivisionTemplate[], scope: MarketScope,
): readonly DivisionTemplate[] {
  return templates.filter(
    (t) => t.scope === scope.kind && (t.scope !== "province" || t.province === scope.code),
  );
}

/**
 * Is this division exactly as some template ships it?
 *
 * Compared on NAME AND MEMBER SET, not on code alone: a workspace that keeps
 * the code and re-carves the ground has customised it, and saying otherwise
 * would label a tenant's own decision as ours.
 */
export function isSystemDivision(
  templates: readonly DivisionTemplate[], code: string, name: string, members: readonly string[],
): boolean {
  const d = templates.map((t) => t.divisions.find((x) => x.code === code) ?? null);
  return templates.some((t, i) => {
    const shipped = d[i];
    if (!shipped || shipped.name !== name) return false;
    /* COMPARED AS SETS, not as sorted arrays. Sorting to compare needed a
       collation for CJK names that neither side actually depends on - the
       question is only "the same provinces", and order is not part of it. It
       also removes a default .sort(), which orders by UTF-16 code unit and is
       the wrong tool for Chinese even when both sides happen to agree. */
    const mine = new Set(members);
    let n = 0;
    for (const [member, c] of Object.entries(t.members)) {
      if (c !== code) continue;
      n += 1;
      if (!mine.has(member)) return false;
    }
    return n === mine.size;
  });
}
