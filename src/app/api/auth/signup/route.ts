import { NextResponse } from "next/server";
import {
  MIN_PASSWORD,
  hashPassword,
  isValidUsername,
  readCredentials,
  startSession,
} from "@/lib/auth";
import { createUser } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/schedule";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const { username, password, name } = await readCredentials(req);

  if (!isValidUsername(username))
    return bad("아이디는 영문·숫자·( _ . - ) 조합 3~20자로 입력하세요.");
  if (password.length < MIN_PASSWORD)
    return bad(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
  if (!name) return bad("이름을 입력하세요.");

  const user = await createUser({
    username,
    passwordHash: await hashPassword(password),
    role: "user",
    settings: { ...DEFAULT_SETTINGS, name },
  });
  if (!user) return bad("이미 사용 중인 아이디입니다.", 409);

  const res = NextResponse.json({ ok: true }, { status: 201 });
  await startSession(res, req, user.id);
  return res;
}
