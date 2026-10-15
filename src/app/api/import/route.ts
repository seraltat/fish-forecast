import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/server-user";

// POST /api/import — восстанавливает данные из JSON-экспорта.
// BodyBody: { spots: [...], catches: [...], sessions: [...], fishConfig: [...] }
// Создаёт новые записи с новыми ID, все Spot/Catch/Session принадлежат
// текущему пользователю (x-user-id). FishConfig — общий для всех
// (только обновляется).
export async function POST(req: Request) {
  const userId = getUserIdFromRequest(req);
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const result = {
    spots: 0,
    catches: 0,
    sessions: 0,
    fishConfig: 0,
    errors: [] as string[],
  };

  // 1. Import spots — create if name+coords don't already exist FOR THIS USER.
  //    (Spot identity is per-user: two users can have a spot with the same
  //    name+coords and they're separate rows.)
  if (Array.isArray(body.spots)) {
    for (const s of body.spots) {
      try {
        const existing = await db.spot.findFirst({
          where: {
            userId,
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
          },
        });
        if (!existing) {
          await db.spot.create({
            data: {
              userId,
              name: s.name,
              latitude: s.latitude,
              longitude: s.longitude,
              description: s.description ?? null,
              waterType: s.waterType ?? "river",
            },
          });
          result.spots++;
        }
      } catch (e) {
        result.errors.push(`Spot "${s.name}": ${(e as Error).message}`);
      }
    }
  }

  // Build a map of spotName → spotId (scoped to this user)
  const allSpots = await db.spot.findMany({ where: { userId } });
  const spotByName = new Map(allSpots.map(s => [s.name, s.id]));

  // Helper: find spot name by old spotId from export data
  const findSpotName = (oldSpotId: string): string | undefined => {
    const sp = body.spots?.find((s: { id: string; name: string }) => s.id === oldSpotId);
    return sp?.name;
  };

  // 2. Import sessions
  const sessionIdMap = new Map<string, string>();
  if (Array.isArray(body.sessions)) {
    for (const s of body.sessions) {
      try {
        const spotName = findSpotName(s.spotId);
        const newSpotId = spotName ? spotByName.get(spotName) : undefined;
        if (!newSpotId) { result.errors.push(`Session: spot not found`); continue; }

        const newSession = await db.session.create({
          data: {
            userId,
            spotId: newSpotId,
            startedAt: s.startedAt ? new Date(s.startedAt) : new Date(),
            waterTemp: s.waterTemp ?? null,
            windDirOverride: s.windDirOverride ?? null,
            windSpeedOverride: s.windSpeedOverride ?? null,
            pressureOverride: s.pressureOverride ?? null,
            notes: s.notes ?? null,
            endedAt: s.endedAt ? new Date(s.endedAt) : null,
          },
        });
        sessionIdMap.set(s.id, newSession.id);
        result.sessions++;
      } catch (e) {
        result.errors.push(`Session: ${(e as Error).message}`);
      }
    }
  }

  // 3. Import catches
  if (Array.isArray(body.catches)) {
    for (const c of body.catches) {
      try {
        const spotName = findSpotName(c.spotId);
        const newSpotId = spotName ? spotByName.get(spotName) : undefined;
        if (!newSpotId) { result.errors.push(`Catch: spot not found`); continue; }

        const newSessionId = c.sessionId ? sessionIdMap.get(c.sessionId) ?? null : null;

        await db.catch.create({
          data: {
            userId,
            spotId: newSpotId,
            species: c.species,
            weightKg: c.weightKg,
            lengthCm: c.lengthCm ?? null,
            caughtAt: c.caughtAt ? new Date(c.caughtAt) : new Date(),
            bait: c.bait ?? null,
            notes: c.notes ?? null,
            photo: c.photo ?? null,
            sessionId: newSessionId,
            waterTemp: c.waterTemp ?? null,
            airTemp: c.airTemp ?? null,
            windSpeed: c.windSpeed ?? null,
            windDir: c.windDir ?? null,
            pressure: c.pressure ?? null,
            moonPhase: c.moonPhase ?? null,
            predictedScore: c.predictedScore ?? null,
          },
        });
        result.catches++;
      } catch (e) {
        result.errors.push(`Catch: ${(e as Error).message}`);
      }
    }
  }

  // 4. Import fishConfig — update or create weights (shared, no userId).
  if (Array.isArray(body.fishConfig)) {
    for (const f of body.fishConfig) {
      try {
        const existing = await db.fishConfig.findFirst({ where: { species: f.species } });
        if (existing) {
          await db.fishConfig.update({
            where: { id: existing.id },
            data: { weightsJson: f.weightsJson, enabled: f.enabled ?? true },
          });
        } else {
          await db.fishConfig.create({
            data: { species: f.species, weightsJson: f.weightsJson, enabled: f.enabled ?? true },
          });
        }
        result.fishConfig++;
      } catch (e) {
        result.errors.push(`FishConfig: ${(e as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported: result,
    message: `Импортировано: ${result.spots} мест, ${result.catches} уловов, ${result.sessions} сессий, ${result.fishConfig} конфигов${result.errors.length > 0 ? `. Ошибок: ${result.errors.length}` : ""}`,
  });
}
