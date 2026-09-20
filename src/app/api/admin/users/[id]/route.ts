import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteUser, getUser } from "@/lib/db";

// 계정 삭제 (제출 기록·로그인도 함께). 관리자 계정은 삭제 불가.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const target = await getUser(id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json(
      { error: "관리자 계정은 삭제할 수 없습니다." },
      { status: 400 }
    );
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
