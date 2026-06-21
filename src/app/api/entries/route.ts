import { NextResponse } from "next/server";
import { getEntries, newId, saveEntry, saveSettings } from "@/lib/db";
import type { DayEntry, Entry, Settings } from "@/lib/schedule";

export async function GET() {
  return NextResponse.json(await getEntries());
}

interface PostBody {
  id?: string;
  periodStart: string;
  periodEnd: string;
  applyDate: string;
  days: DayEntry[];
  settings: Settings;
}

export async function POST(req: Request) {
  const body = (await req.json()) as PostBody;

  if (!body.days || body.days.length !== 5) {
    return NextResponse.json(
      { error: "days must contain 5 weekday entries" },
      { status: 400 }
    );
  }

  // 주당 1건 유지: 같은 신청기간(periodStart)이 이미 있으면 그 id로 덮어쓰기
  const existing = (await getEntries()).find(
    (e) => e.periodStart === body.periodStart
  );

  const now = new Date().toISOString();
  const entry: Entry = {
    id: body.id || existing?.id || newId(),
    createdAt: now,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    applyDate: body.applyDate,
    days: body.days,
    settings: body.settings,
  };

  await saveEntry(entry);
  // 최신 설정값을 기본값으로 기억
  await saveSettings(body.settings);

  return NextResponse.json(entry, { status: 201 });
}
