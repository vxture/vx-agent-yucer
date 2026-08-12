// Product brand constants. The product code was stamped at instantiation
// (instantiate.mjs replaced the placeholder with `yucer`).
export const BRAND = {
  productCode: "yucer",
  displayName: "Yucer",
  // Primary market is Chinese enterprise sales organisations; the product spec
  // under docs/20-specs/ is authored in Chinese for the same reason.
  defaultLocale: "zh-CN",
} as const;

export type Brand = typeof BRAND;
