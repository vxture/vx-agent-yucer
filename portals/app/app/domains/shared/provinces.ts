// 省份 - the province vocabulary, and nothing else.
//
// ONE SOURCE FOR THREE CONSUMERS. The same 34 names appear in three places that
// must agree exactly or a roll-up loses a province without saying so:
//
//   1. incr/0035's CHECK constraint on yucer_core.account.province
//   2. the situation screen's map geometry, which is keyed by these strings
//   3. this file, which every aggregation reads
//
// The spelling is the national statistical bureau's - 江苏省, not 江苏 - because
// the map's geometry is keyed that way and a near-miss finds no shape. The
// database refuses anything outside the list, so a value that reaches this
// module is guaranteed to be in it.
//
// 大区 IS NOT HERE ANY MORE, and that is the point of this file being short.
// It used to carry a hard-coded seven-way grouping and a regionOfProvince()
// that read it, which made the carve a property of the BUILD - the same for
// every tenant, changeable only by deploying. It is data now
// (yucer_core.market_division, incr/0036): each workspace owns its own
// divisions, and a province's 大区 is whatever that workspace says it is.
// Anything needing the mapping reads it from the store.

/**
 * All 34 provincial-level divisions, in the national statistical bureau's
 * own order: municipalities and the north, the north-east, the east, and so
 * on down. The order is presentational only - nothing groups by it.
 */
export const ALL_PROVINCES: readonly string[] = [
  "北京市", "天津市", "河北省", "山西省", "内蒙古自治区",
  "辽宁省", "吉林省", "黑龙江省",
  "上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "台湾省",
  "河南省", "湖北省", "湖南省",
  "广东省", "广西壮族自治区", "海南省", "香港特别行政区", "澳门特别行政区",
  "重庆市", "四川省", "贵州省", "云南省", "西藏自治区",
  "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区",
];

/** Short label for a province - what fits on a map at region zoom. */
export function shortProvince(province: string): string {
  return province
    .replace("内蒙古自治区", "内蒙古")
    .replace("广西壮族自治区", "广西")
    .replace("新疆维吾尔自治区", "新疆")
    .replace("宁夏回族自治区", "宁夏")
    .replace(/(省|市|自治区|特别行政区)$/, "");
}

/**
 * Is this one of the 34 provincial-level divisions?
 *
 * The same set incr/0035 CHECK-constrains `account.province` to. Needed on the
 * write path because the in-memory store has no CHECK: without it a demo write
 * would succeed and put a customer on ground the map has no shape for, and a
 * real write would fail at the database with a constraint error nobody can act
 * on. Refused in the product's own terms in both.
 */
export function isProvince(value: string): boolean {
  return (ALL_PROVINCES as readonly string[]).includes(value);
}

/**
 * 省级行政区的两位字母码 - GB/T 2260 的字母代码，与 ISO 3166-2:CN 同源。
 *
 * WHY A CODE AT ALL (owner, 2026-09-08): the tag that stands for a province in
 * configuration reads `JS 江苏`, not `江苏` alone. The letters are the standard
 * ones - a workspace that exports its carve, or matches it against anything
 * else, is matching on these - and two characters of latin ahead of the name
 * make a wall of 34 tags scannable in a way 34 Chinese words are not.
 *
 * NOT INVENTED HERE: the codes are the national standard's own. A house
 * abbreviation would be a second vocabulary for the same 34 things.
 */
export const PROVINCE_CODE: Readonly<Record<string, string>> = {
  北京市: "BJ", 天津市: "TJ", 河北省: "HE", 山西省: "SX", 内蒙古自治区: "NM",
  辽宁省: "LN", 吉林省: "JL", 黑龙江省: "HL",
  上海市: "SH", 江苏省: "JS", 浙江省: "ZJ", 安徽省: "AH", 福建省: "FJ",
  江西省: "JX", 山东省: "SD",
  河南省: "HA", 湖北省: "HB", 湖南省: "HN",
  广东省: "GD", 广西壮族自治区: "GX", 海南省: "HI",
  重庆市: "CQ", 四川省: "SC", 贵州省: "GZ", 云南省: "YN", 西藏自治区: "XZ",
  陕西省: "SN", 甘肃省: "GS", 青海省: "QH", 宁夏回族自治区: "NX",
  新疆维吾尔自治区: "XJ",
  台湾省: "TW", 香港特别行政区: "HK", 澳门特别行政区: "MO",
};

/** `JS 江苏` - what a province looks like wherever configuration shows one. */
export function provinceTag(province: string): string {
  const code = PROVINCE_CODE[province];
  return code ? `${code} ${shortProvince(province)}` : shortProvince(province);
}
