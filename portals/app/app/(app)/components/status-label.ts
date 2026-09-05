import type { ProductStatusRecord } from "../../domains/catalog/store";

// Status rendering conventions - tone only; the NAME is the row's own (a
// vocabulary row says what it is called, the interface never substitutes).
//
// Tones read the canonical codes: development is informational, on sale is
// the good state, the shelf is neutral. A workspace-added status renders
// informational - it lives in the live roster.

export function statusTone(row: ProductStatusRecord): "info" | "success" | "neutral" {
  switch (row.statusCode) {
    case "active":
      return "success";
    case "retired":
      return "neutral";
    default:
      return "info";
  }
}
