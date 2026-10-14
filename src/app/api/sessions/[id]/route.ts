import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await db.session.findUnique({
    where: { id },
    include: { spot: true, catches: true },
  });
  if (!session) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  return NextResponse.json({ session });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: {
    waterTemp?: number | null;
    windDirOverride?: number | null;
    windSpeedOverride?: number | null;
    pressureOverride?: number | null;
    notes?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const session = await db.session.update({
    where: { id },
    data: {
      ...(body.waterTemp !== undefined ? { waterTemp: body.waterTemp } : {}),
      ...(body.windDirOverride !== undefined ? { windDirOverride: body.windDirOverride } : {}),
      ...(body.windSpeedOverride !== undefined ? { windSpeedOverride: body.windSpeedOverride } : {}),
      ...(body.pressureOverride !== undefined ? { pressureOverride: body.pressureOverride } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
    include: { spot: true },
  });
  return NextResponse.json({ session });
}
