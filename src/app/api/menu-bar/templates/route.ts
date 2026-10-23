import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { deleteTemplate, getTemplates, saveTemplate, useTemplate } from "@/lib/db";
import {
  cleanTemplateName, templateDaysFrom, validTemplateDays,
} from "@/features/menu-bar/model/template";
import { validDays } from "@/features/menu-bar/model/plan";

export async function GET() {
  if (!(await getCurrentUser())) return unauthorized();
  return NextResponse.json(await getTemplates());
}

// action "save": 현재 일정을 이름 붙여 저장 (같은 이름이면 덮어씀)
// action "use":  고른 템플릿을 기본값으로 지정
export async function POST(req: Request) {
  if (!(await getCurrentUser())) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body) return bad("요청을 확인하세요.");

  if (body.action === "use") {
    if (typeof body.id !== "string" || !body.id) return bad("템플릿을 선택하세요.");
    return NextResponse.json(await useTemplate(body.id));
  }

  if (body.action === "save") {
    const name = cleanTemplateName(body.name);
    if (!name) return bad("템플릿 이름을 입력하세요.");
    // 화면의 일정(요일·휴가 포함)에서 시각만 추려 담는다.
    if (!validDays(body.days) || typeof body.periodStart !== "string") {
      return bad("저장할 일정을 확인하세요.");
    }
    const days = templateDaysFrom(body.days, body.periodStart);
    if (!validTemplateDays(days)) return bad("저장할 근무시간을 확인하세요.");
    return NextResponse.json(await saveTemplate(name, days));
  }

  return bad("지원하지 않는 템플릿 작업입니다.");
}

export async function DELETE(req: Request) {
  if (!(await getCurrentUser())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("삭제할 템플릿을 선택하세요.");
  return NextResponse.json(await deleteTemplate(id));
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
