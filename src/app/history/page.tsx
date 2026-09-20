import { redirect } from "next/navigation";
import HistoryList from "@/components/HistoryList";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!(await getCurrentUser())) redirect("/login?next=/history");
  return <HistoryList />;
}
