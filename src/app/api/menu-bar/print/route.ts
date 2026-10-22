import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { validDays } from "@/features/menu-bar/model/plan";
import { printHTML } from "@/features/menu-bar/model/print";
import type { Entry } from "@/lib/schedule";

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body || !validDays(body.days) ||
      ![body.periodStart, body.periodEnd, body.applyDate].every(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      !["company", "department", "birth", "name", "coreTime"].every(key => typeof body.settings?.[key] === "string")) {
    return NextResponse.json({ error: "인쇄할 신청서 정보를 확인하세요." }, { status: 400 });
  }
  return new Response(printHTML(body as Entry), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
