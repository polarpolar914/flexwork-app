import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getEntries, getUser } from "@/lib/db";

// 특정 사용자의 제출 기록 (관리자 읽기 전용)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  if (!(await getUser(id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await getEntries(id));
}
