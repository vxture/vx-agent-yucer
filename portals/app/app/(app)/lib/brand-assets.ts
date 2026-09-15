// Where the marks live.
//
// ONE PLACE, because both of them are placeholders for something a designer
// will hand over later (owner, 2026-09-15: "the logo needs to be a file, not
// hard-coded - it gets replaced"). Swapping either mark is replacing the file
// at the path below, or editing one line here if the path changes too. Nothing
// else in the product names an image.
//
// They are NOT in the message dictionary: a mark is not copy, and a brand name
// is not translated - "ruyin.work" reads the same in both locales, which is the
// whole point of a wordmark.

/** The company mark, in the header. Vxture ships it with the design assets. */
export const BRAND_MARK_SRC = "/assets/brand/vxture-logo-icon.svg";

/** The company wordmark beside it. */
export const BRAND_WORDMARK = "ruyin.work";

/** The product mark, in the identity block every gate screen carries. */
export const PRODUCT_MARK_SRC = "/logo.svg";
