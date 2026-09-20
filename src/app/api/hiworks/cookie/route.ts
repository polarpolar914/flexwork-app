import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getHiworksCookie, saveHiworksCookie } from "@/lib/db";

// 쿠키 자체는 절대 돌려주지 않는다(민감). 등록 여부만 알려준다.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ connected: Boolean(await getHiworksCookie(user.id)) });
}

// PUT { cookie: "<브라우저 Cookie 헤더 문자열>" } — 빈 문자열이면 연결 해제
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { cookie?: unknown };
  await saveHiworksCookie(user.id, String(body.cookie ?? ""));
  return NextResponse.json({ connected: Boolean(await getHiworksCookie(user.id)) });
}
