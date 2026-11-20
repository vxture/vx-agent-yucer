/** One contract for forms, domain saves and model-generated drafts. */
export const CATALOG_TEXT_LIMITS = { name: 80, summary: 120, scenario: 300, note: 300 } as const;
export type CatalogTextField = keyof typeof CATALOG_TEXT_LIMITS;

/** Legacy text may survive an unrelated edit; never silently truncate it. */
export function catalogTextTooLong(field: CatalogTextField, value: string | null | undefined, previous?: string | null): boolean {
  const text = value?.trim() ?? "";
  return text.length > CATALOG_TEXT_LIMITS[field] && text !== previous?.trim();
}
