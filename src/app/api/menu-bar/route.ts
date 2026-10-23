import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getEntries, getTemplates } from "@/lib/db";
import { transformDays, weekPlan } from "@/features/menu-bar/model/plan";
import { lastUsedTemplate } from "@/features/menu-bar/model/template";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const week = new URL(req.url).searchParams.get("week") ?? "this";
  if (week !== "this" && week !== "next") {
    return NextResponse.json({ error: "이번 주 또는 다음 주를 선택하세요." }, { status: 400 });
  }
  const [entries, templates] = await Promise.all([getEntries(user.id), getTemplates()]);
  return NextResponse.json({
    ...weekPlan(week, entries, user.settings, lastUsedTemplate(templates)),
    templates,
  });
}

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return unauthorized();
  try {
    return NextResponse.json({ days: transformDays(await req.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "잘못된 요청입니다." }, { status: 400 });
  }
}
