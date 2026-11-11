import { redirect } from "next/navigation";

// Product and current pricing now share the catalogue. Preserve analysis and
// selection links from bookmarks while keeping a single product roster.
export default async function PricebookPage({ searchParams }: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      next.append(key, item);
    }
  }
  redirect(`/catalog${next.size ? `?${next}` : ""}`);
}
