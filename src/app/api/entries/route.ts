import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import {
  type StoredEntry,
  cleanSettings,
  getEntries,
  newId,
  saveEntry,
  saveSettings,
} from "@/lib/db";
import type { DayEntry, Settings } from "@/lib/schedule";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json(await getEntries(user.id));
}

interface PostBody {
  periodStart: string;
  periodEnd: string;
  applyDate: string;
  days: DayEntry[];
  settings: Settings;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = (await req.json()) as PostBody;

  if (!body.days || body.days.length !== 5) {
    return NextResponse.json(
      { error: "days must contain 5 weekday entries" },
      { status: 400 }
    );
  }

  // 주당 1건 유지: 본인의 같은 신청기간(periodStart)이 이미 있으면 그 id로 덮어쓰기
  const existing = (await getEntries(user.id)).find(
    (e) => e.periodStart === body.periodStart
  );
  const settings = cleanSettings(body.settings);

  const now = new Date().toISOString();
  const entry: StoredEntry = {
    // id는 서버에서만 정함 → 관리자가 id만으로 찾아도 사용자 간에 겹치지 않음
    id: existing?.id || newId(),
    userId: user.id,
    createdAt: now,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    applyDate: body.applyDate,
    days: body.days,
    settings,
  };

  await saveEntry(entry);
  // 최신 설정값을 기본값으로 기억
  await saveSettings(settings);

  return NextResponse.json(entry, { status: 201 });
}
