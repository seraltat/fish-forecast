import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSpecies, type Species } from "@/lib/species";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const spotId = url.searchParams.get("spotId");
  const species = url.searchParams.get("species");

  const where: {
    spotId?: string;
    species?: string;
  } = {};
  if (spotId) where.spotId = spotId;
  if (species) where.species = species;

  const catches = await db.catch.findMany({
    where,
    include: { spot: true, session: true },
    orderBy: { caughtAt: "desc" },
  });
  return NextResponse.json({ catches });
}

export async function POST(req: Request) {
  let body: {
    spotId?: string;
    species?: string;
    weightKg?: number;
    lengthCm?: number | null;
    caughtAt?: string;
    bait?: string | null;
    notes?: string | null;
    sessionId?: string | null;
    // snapshot
    waterTemp?: number | null;
    airTemp?: number | null;
    windSpeed?: number | null;
    windDir?: number | null;
    pressure?: number | null;
    moonPhase?: number | null;
    predictedScore?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (!body.spotId || !isSpecies(body.species) || typeof body.weightKg !== "number") {
    return NextResponse.json(
      { error: "Укажите место, вид рыбы и вес" },
      { status: 400 }
    );
  }
  const caught = await db.catch.create({
    data: {
      spotId: body.spotId,
      species: body.species as Species,
      weightKg: body.weightKg,
      lengthCm: body.lengthCm ?? null,
      caughtAt: body.caughtAt ? new Date(body.caughtAt) : new Date(),
      bait: body.bait ?? null,
      notes: body.notes ?? null,
      sessionId: body.sessionId ?? null,
      waterTemp: body.waterTemp ?? null,
      airTemp: body.airTemp ?? null,
      windSpeed: body.windSpeed ?? null,
      windDir: body.windDir ?? null,
      pressure: body.pressure ?? null,
      moonPhase: body.moonPhase ?? null,
      predictedScore: body.predictedScore ?? null,
    },
    include: { spot: true, session: true },
  });
  return NextResponse.json({ catch: caught });
}
