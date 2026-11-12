// Backwards-compatible presentation inside the existing versioned text field.
// Historical plain text is preserved verbatim as the general prerequisite.
export const prerequisiteGroups = [
  "general",
  "customers",
  "products",
  "people",
  "services",
] as const;
export type PrerequisiteGroup = (typeof prerequisiteGroups)[number];
export type PlanPrerequisites = Record<PrerequisiteGroup, string[]>;
const prefix = "@yucer/plan-prerequisites:v1\n";
const empty = (): PlanPrerequisites => ({
  general: [],
  customers: [],
  products: [],
  people: [],
  services: [],
});
export function readPrerequisites(text: string): PlanPrerequisites {
  if (text.startsWith(prefix)) {
    try {
      const parsed: unknown = JSON.parse(text.slice(prefix.length));
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length === prerequisiteGroups.length &&
        prerequisiteGroups.every((group) => {
          const items = (parsed as Record<string, unknown>)[group];
          return (
            Array.isArray(items) &&
            items.every((item) => typeof item === "string")
          );
        })
      )
        return parsed as PlanPrerequisites;
    } catch {
      /* Keep unrecognized content as plain text, never erase it. */
    }
  }
  return { ...empty(), general: text ? [text] : [] };
}
export function writePrerequisites(groups: PlanPrerequisites): string {
  // Keep existing general-only text unchanged when no categorization is needed.
  if (
    prerequisiteGroups.slice(1).every((group) => !groups[group].length) &&
    groups.general.length <= 1
  )
    return groups.general[0] ?? "";
  return (
    prefix +
    JSON.stringify(
      Object.fromEntries(
        prerequisiteGroups.map((group) => [group, groups[group]]),
      ),
    )
  );
}
