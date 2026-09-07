// 省份与大区 - the province vocabulary, and the roll-up from a province to its 大区.
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
// WHY 大区 IS DERIVED HERE AND STILL STORED ON THE ROW. A province belongs to
// exactly one 大区, so the mapping is total and this file could be the only
// place it lives. The column stays because territory routing matches on it in
// SQL (incr/0017), and moving that mapping into TypeScript would put it
// somewhere the routing rule cannot reach. This module is the reverse
// direction: given a province, which 大区 does it roll up to.

/** The seven 大区, each with the provinces that roll up to it. Order is reading order. */
export const PROVINCES_BY_REGION = {
  华北: ["北京市", "天津市", "河北省", "山西省", "内蒙古自治区"],
  东北: ["辽宁省", "吉林省", "黑龙江省"],
  华东: ["上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "台湾省"],
  华中: ["河南省", "湖北省", "湖南省"],
  华南: ["广东省", "广西壮族自治区", "海南省", "香港特别行政区", "澳门特别行政区"],
  西南: ["重庆市", "四川省", "贵州省", "云南省", "西藏自治区"],
  西北: ["陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区"],
} as const;

export type Region = keyof typeof PROVINCES_BY_REGION;

/** All 34 provincial-level divisions, in 大区 reading order. */
export const ALL_PROVINCES: readonly string[] =
  Object.values(PROVINCES_BY_REGION).flat();

const REGION_OF: Record<string, Region> = Object.fromEntries(
  Object.entries(PROVINCES_BY_REGION).flatMap(([r, ps]) =>
    ps.map((p) => [p, r as Region]),
  ),
);

/**
 * The 大区 a province rolls up to, or null.
 *
 * NULL RATHER THAN A GUESS. An unrecognised province is a data fault worth
 * surfacing - the database's CHECK should have refused it - and inventing a
 * 大区 for it would put the row in a total that nobody could trace back.
 */
export function regionOfProvince(province: string | null | undefined): Region | null {
  if (!province) return null;
  return REGION_OF[province] ?? null;
}

/** Short label for a province - what fits on a map at region zoom. */
export function shortProvince(province: string): string {
  return province
    .replace("内蒙古自治区", "内蒙古")
    .replace("广西壮族自治区", "广西")
    .replace("新疆维吾尔自治区", "新疆")
    .replace("宁夏回族自治区", "宁夏")
    .replace(/(省|市|自治区|特别行政区)$/, "");
}
