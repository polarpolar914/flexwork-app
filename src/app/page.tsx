import Planner from "@/components/Planner";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getSettings();
  return <Planner initialSettings={settings} />;
}
