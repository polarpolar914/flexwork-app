import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { deleteEntry, getEntry } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const entry = await getEntry(user.id, id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(entry);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  await deleteEntry(user.id, id);
  return NextResponse.json({ ok: true });
}
