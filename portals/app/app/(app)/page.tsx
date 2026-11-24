import { loadHomeOverview } from "./lib/home-overview";
import { HomeOverviewView } from "./components/home-overview";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const data = await loadHomeOverview();
  return data ? <HomeOverviewView data={data} /> : null;
}
