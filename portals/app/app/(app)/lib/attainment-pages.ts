import type { AttainmentQuery } from "./attainment-workspace";
export const ATTAINMENT_SCREENS = [
  "company",
  "customers",
  "regions",
  "region",
  "team",
  "mine",
  "forecast",
  "history",
] as const;
export type AttainmentScreen = (typeof ATTAINMENT_SCREENS)[number];
export function attainmentScreen(
  query: AttainmentQuery,
): AttainmentScreen | null {
  if (query.screen !== undefined)
    return typeof query.screen === "string" &&
      ATTAINMENT_SCREENS.includes(query.screen as AttainmentScreen)
      ? (query.screen as AttainmentScreen)
      : null;
  if (query.view === "history") return "history";
  if (query.view === "review") return "forecast";
  if (query.scope === "personal" || query.perspective === "personal")
    return "mine";
  if (
    query.perspective === "team" ||
    (typeof query.scope === "string" && query.scope.startsWith("owner:"))
  )
    return "team";
  if (typeof query.scope === "string" && query.scope.startsWith("territory:"))
    return "region";
  return "company";
}
export function attainmentPageHref(
  screen: AttainmentScreen,
  period: string,
  scope = "workspace",
  revision?: string | null,
) {
  const query = new URLSearchParams({
    screen,
    period,
    scope,
    view:
      screen === "forecast"
        ? "review"
        : screen === "history"
          ? "history"
          : "progress",
  });
  if (revision) query.set("planRevision", revision);
  return `/attainment?${query}`;
}
