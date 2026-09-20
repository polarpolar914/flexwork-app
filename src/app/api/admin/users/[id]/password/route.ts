import { NextResponse } from "next/server";
import { MIN_PASSWORD, hashPassword, requireAdmin } from "@/lib/auth";
import { getUser, removeUserSessions, updateUser } from "@/lib/db";

// 비밀번호 초기화: 새 비밀번호로 바꾸고 그 사용자의 기존 로그인은 모두 해제
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const target = await getUser(id);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json(
      { error: "관리자 비밀번호는 ADMIN_PASSWORD 환경변수로 바꿉니다." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    password?: unknown;
  } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.` },
      { status: 400 }
    );
  }

  await updateUser(id, { passwordHash: await hashPassword(password) });
  await removeUserSessions(id);
  return NextResponse.json({ ok: true });
}
