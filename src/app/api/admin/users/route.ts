import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listUserSummaries } from "@/lib/db";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await listUserSummaries());
}
