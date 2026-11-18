export const COLLECTION_VIEW_COOKIE = "yucer_collection_view";

export function collectionViewPreference(value: string | undefined) {
  return value === "list" || value === "cards" ? value : undefined;
}
