import { NextResponse } from "next/server";
import { startSession, verifyAppPassword } from "@/lib/auth";

// 단일 계정: 비밀번호(APP_PASSWORD)만으로 인증.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = String(body.password ?? "");

  if (!(await verifyAppPassword(password))) {
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  startSession(res, req);
  return res;
}
