import { notFound } from "next/navigation";
import { ProgressionPreview } from "./progression-preview";

export const dynamic = "force-dynamic";

export default function ProgressionDesignPage() {
  // A local design review, never a production business entry point.
  if (process.env.NODE_ENV !== "development") notFound();
  return <ProgressionPreview />;
}
