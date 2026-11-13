import { redirect } from "next/navigation";

// The sole pending route, /account/complete, now has its proper business entry
// in account-completeness.tsx. Retain old bookmarks without an empty admin UI.
export default function RetiredMigrationPage() {
  redirect("/admin");
}
