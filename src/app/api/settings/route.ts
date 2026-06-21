import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/schedule";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Settings>;
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(await getSettings()), ...body };
  return NextResponse.json(await saveSettings(merged));
}
