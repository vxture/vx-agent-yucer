import { redirect } from "next/navigation";

// Compatibility for existing bookmarks; regions are managed in configuration.
export default function LegacyTerritoryPage() {
  redirect("/admin/division");
}
