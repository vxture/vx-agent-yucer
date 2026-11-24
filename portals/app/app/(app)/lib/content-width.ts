/** Per-account, product-local display preference. Never use a tenant setting. */
export type ContentWidth = "standard" | "wide";

export function contentWidthPreference(value: string | undefined | null): ContentWidth {
  return value === "wide" ? "wide" : "standard";
}

/** A different signed-in account must not inherit the previous user's choice. */
export function contentWidthCookieName(subject: string): string {
  return `yucer_content_width_${encodeURIComponent(subject)}`;
}
