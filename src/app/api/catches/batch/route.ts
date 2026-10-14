import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSpecies, type Species } from "@/lib/species";

// POST /api/catches/batch
// Body: { count, species, weightKg, lengthCm?, spotId, bait?, caughtAt, notes?,
//         sessionId?, waterTemp?, airTemp?, windSpeed?, windDir?, pressure?, moonPhase?,
//         predictedScore? }
// Creates `count` identical catch rows in the DB in a single transaction.
export async function POST(req: Request) {
  let body: {
    count?: number;
    species?: string;
    weightKg?: number;
    lengthCm?: number | null;
    spotId?: string;
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

  const count = Math.max(1, Math.min(50, Math.floor(Number(body.count) || 1)));
  if (!body.spotId || !isSpecies(body.species) || typeof body.weightKg !== "number") {
    return NextResponse.json(
      { error: "Укажите место, вид рыбы и средний вес" },
      { status: 400 }
    );
  }

  const caughtAtDate = body.caughtAt ? new Date(body.caughtAt) : new Date();
  const baseData = {
    spotId: body.spotId,
    species: body.species as Species,
    weightKg: body.weightKg,
    lengthCm: body.lengthCm ?? null,
    caughtAt: caughtAtDate,
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
  };

  // Use createMany inside a transaction to insert all rows at once.
  await db.$transaction([
    db.catch.createMany({ data: Array.from({ length: count }, () => baseData) }),
  ]);

  // createMany doesn't return rows. Fetch the last `count` rows for this
  // spot+species+caughtAt to return to the client.
  const created = await db.catch.findMany({
    where: {
      spotId: body.spotId,
      species: body.species,
      caughtAt: caughtAtDate,
    },
    include: { spot: true, session: true },
    orderBy: { createdAt: "desc" },
    take: count,
  });

  return NextResponse.json({
    count: created.length,
    catches: created,
  });
}
