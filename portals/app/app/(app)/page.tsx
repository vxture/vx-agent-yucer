import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
// One home for today's findings and their continuing private task.
export default function HomePage() { redirect("/copilot"); }
