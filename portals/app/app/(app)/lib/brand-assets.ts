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

/**
 * The product mark, in the identity block every gate screen carries, AND
 * (since 2026-09-16) the browser tab's favicon - see the root layout's
 * `metadata.icons`.
 *
 * SVG here because the product renders it at four different sizes. The same
 * mark is also published as `/logo.png` (512px, transparent) for consumers
 * that cannot take SVG - the platform asked for both, and the favicon link
 * carries it as the `shortcut` fallback for that same reason. Nothing else in
 * this product reads the PNG; the two files have to be regenerated together.
 * The PNG is rendered from the SVG's own geometry rather than traced from it:
 * same segments, same stroke width, same colours.
 */
export const PRODUCT_MARK_SRC = "/logo.svg";

/** The PNG fallback beside it - see PRODUCT_MARK_SRC's own comment. */
export const PRODUCT_MARK_PNG_SRC = "/logo.png";
