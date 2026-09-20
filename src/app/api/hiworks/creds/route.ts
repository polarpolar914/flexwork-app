import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getHiworksCreds, saveHiworksCreds } from "@/lib/db";

// 자격증명 자체(비번)는 절대 돌려주지 않는다. 등록 여부와 id만 노출.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const creds = await getHiworksCreds(user.id);
  return NextResponse.json({ connected: Boolean(creds), id: creds?.id ?? "" });
}

// PUT { id: "아이디@오피스", password } — 하나라도 비면 해제
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    password?: unknown;
  };
  const id = String(body.id ?? "");
  const password = String(body.password ?? "");
  if (id && !id.includes("@")) {
    return NextResponse.json(
      { error: 'id는 "아이디@오피스도메인" 형태여야 합니다 (예: myid@smartdoctor)' },
      { status: 400 }
    );
  }
  await saveHiworksCreds(user.id, id, password);
  const creds = await getHiworksCreds(user.id);
  return NextResponse.json({ connected: Boolean(creds), id: creds?.id ?? "" });
}
