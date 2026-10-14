import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const spots = await db.spot.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ spots });
}

export async function POST(req: Request) {
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
  if (body.waterType && !["river", "lake"].includes(body.waterType)) {
    return NextResponse.json({ error: "Тип воды — river или lake" }, { status: 400 });
  }
  const spot = await db.spot.create({
    data: {
      name: body.name,
      latitude: body.latitude,
      longitude: body.longitude,
      description: body.description ?? null,
      waterType: body.waterType ?? "lake",
    },
  });
  return NextResponse.json({ spot });
}
