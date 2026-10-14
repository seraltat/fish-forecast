import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await db.catch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
