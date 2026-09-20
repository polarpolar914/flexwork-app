import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { saveUserSettings } from "@/lib/db";
import type { Settings } from "@/lib/schedule";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json(user.settings);
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = (await req.json()) as Partial<Settings>;
  // 보낸 항목만 덮어쓰고 나머지는 기존값 유지
  return NextResponse.json(await saveUserSettings(user.id, body));
}
