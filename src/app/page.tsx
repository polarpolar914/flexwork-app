import { redirect } from "next/navigation";
import Planner from "@/components/Planner";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Planner initialSettings={user.settings} />;
}
