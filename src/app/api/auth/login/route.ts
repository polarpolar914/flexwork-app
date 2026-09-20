import { NextResponse } from "next/server";
import { readCredentials, startSession, verifyPassword } from "@/lib/auth";
import { findUserByUsername } from "@/lib/db";

export async function POST(req: Request) {
  const { username, password } = await readCredentials(req);
  const user = await findUserByUsername(username);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  await startSession(res, req, user.id);
  return res;
}
