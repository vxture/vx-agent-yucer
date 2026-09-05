import type { StatusVocabRow } from "../../domains/catalog/lib/lifecycle";

// Rendering the status vocabulary - ONE reading for every surface.
//
// A row's label is its workspace-given name, falling back to the interface's
// default for the three system codes. The tone reads BEHAVIOR, not the code:
// a workspace-added "预售" with active behavior is green like 在售, because
// green here means "quotable" and that is the behavior's promise.

export interface StatusDefaults {
  readonly statusDev: string;
  readonly statusActive: string;
  readonly statusRetired: string;
}

export function statusLabelOf(row: StatusVocabRow, T: StatusDefaults): string {
  if (row.name) return row.name;
  switch (row.statusCode) {
    case "in_development":
      return T.statusDev;
    case "active":
      return T.statusActive;
    case "retired":
      return T.statusRetired;
    default:
      return row.statusCode;
  }
}

export const BEHAVIOR_TONE = {
  in_development: "info",
  active: "success",
  retired: "neutral",
} as const;
