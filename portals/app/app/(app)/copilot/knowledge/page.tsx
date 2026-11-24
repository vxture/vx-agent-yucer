import { redirect } from "next/navigation";

// Team knowledge is maintained by the knowledge platform, once connected.
export const dynamic = "force-dynamic";
export default function KnowledgePage() {
  redirect("/copilot");
}
