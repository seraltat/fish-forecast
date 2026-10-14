import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/export — выгружает все данные пользователя в JSON.
// Включает: места (spots), уловы (catches), сессии (sessions), конфиги рыб (fishConfig).
// Используется для резервного копирования — при развёртывании на новом сервере
// можно импортировать через POST /api/import (если будет добавлен).
export async function GET() {
  const spots = await db.spot.findMany();
  const catches = await db.catch.findMany();
  const sessions = await db.session.findMany();
  const fishConfig = await db.fishConfig.findMany();

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    spots: spots.map(s => ({
      id: s.id,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      description: s.description,
      waterType: s.waterType,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    catches: catches.map(c => ({
      id: c.id,
      spotId: c.spotId,
      species: c.species,
      weightKg: c.weightKg,
      lengthCm: c.lengthCm,
      caughtAt: c.caughtAt,
      bait: c.bait,
      notes: c.notes,
      sessionId: c.sessionId,
      waterTemp: c.waterTemp,
      airTemp: c.airTemp,
      windSpeed: c.windSpeed,
      windDir: c.windDir,
      pressure: c.pressure,
      moonPhase: c.moonPhase,
      predictedScore: c.predictedScore,
    })),
    sessions: sessions.map(s => ({
      id: s.id,
      spotId: s.spotId,
      startedAt: s.startedAt,
      waterTemp: s.waterTemp,
      windDirOverride: s.windDirOverride,
      windSpeedOverride: s.windSpeedOverride,
      pressureOverride: s.pressureOverride,
      notes: s.notes,
      endedAt: s.endedAt,
    })),
    fishConfig: fishConfig.map(f => ({
      id: f.id,
      species: f.species,
      weightsJson: f.weightsJson,
      enabled: f.enabled,
    })),
  };

  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="fish-forecast-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
