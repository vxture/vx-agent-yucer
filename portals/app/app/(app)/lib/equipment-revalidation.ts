import { revalidatePath } from "next/cache";

/** Catalog and market metadata are read across all four equipment modules.
 * Published strategy/quote snapshots remain immutable in their own stores. */
export function revalidateEquipmentConsumers(): void {
  for (const path of ["/catalog", "/solution", "/segment", "/strategy"]) {
    revalidatePath(path, "layout");
  }
}
