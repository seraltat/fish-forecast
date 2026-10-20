import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/server-user";

export async function GET(req: Request) {
  const userId = getUserIdFromRequest(req);
  const spots = await db.spot.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ spots });
}

export async function POST(req: Request) {
  const userId = getUserIdFromRequest(req);
  let body: { name?: string; latitude?: number; longitude?: number; description?: string; waterType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (!body.name || typeof body.latitude !== "number" || typeof body.longitude !== "number") {
    return NextResponse.json(
      { error: "Укажите название и координаты" },
      { status: 400 }
    );
  }
  if (body.waterType && !["river", "lake", "протока", "канал"].includes(body.waterType)) {
    return NextResponse.json({ error: "Тип воды — river, lake, протока или канал" }, { status: 400 });
  }
  const spot = await db.spot.create({
    data: {
      userId,
      name: body.name,
      latitude: body.latitude,
      longitude: body.longitude,
      description: body.description ?? null,
      waterType: body.waterType ?? "lake",
    },
  });
  return NextResponse.json({ spot });
}
