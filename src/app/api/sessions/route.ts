import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const where = activeOnly ? { endedAt: null } : {};
  const sessions = await db.session.findMany({
    where,
    include: { spot: true },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  let body: {
    spotId?: string;
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
  if (!body.spotId) {
    return NextResponse.json({ error: "Укажите spotId" }, { status: 400 });
  }
  const session = await db.session.create({
    data: {
      spotId: body.spotId,
      waterTemp: body.waterTemp ?? null,
      windDirOverride: body.windDirOverride ?? null,
      windSpeedOverride: body.windSpeedOverride ?? null,
      pressureOverride: body.pressureOverride ?? null,
      notes: body.notes ?? null,
    },
    include: { spot: true },
  });
  return NextResponse.json({ session });
}
