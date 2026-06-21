import { NextResponse } from "next/server";
import { deleteEntry, getEntry } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entry = await getEntry(id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(entry);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteEntry(id);
  return NextResponse.json({ ok: true });
}
