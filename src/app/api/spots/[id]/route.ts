import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/server-user";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = getUserIdFromRequest(req);
  const spot = await db.spot.findFirst({ where: { id, userId } });
  if (!spot) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  return NextResponse.json({ spot });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = getUserIdFromRequest(req);
  // Verify ownership before mutating — prevents cross-user edits.
  const existing = await db.spot.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  let body: {
    name?: string;
    latitude?: number;
    longitude?: number;
    description?: string | null;
    waterType?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (body.waterType && !["river", "lake", "протока", "канал"].includes(body.waterType)) {
    return NextResponse.json({ error: "Тип воды — river, lake, протока или канал" }, { status: 400 });
  }
  const spot = await db.spot.update({
    where: { id },
    data: {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.latitude != null ? { latitude: body.latitude } : {}),
      ...(body.longitude != null ? { longitude: body.longitude } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.waterType != null ? { waterType: body.waterType } : {}),
    },
  });
  return NextResponse.json({ spot });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = getUserIdFromRequest(req);
  // Verify ownership before deleting.
  const existing = await db.spot.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  await db.spot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
