import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCached, setCached } from "@/lib/cache";
import type { WeatherResponse } from "@/lib/types";

const OM_URL = (lat: number, lon: number, days: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover,weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=${days}&past_days=3&wind_speed_unit=ms`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") || "");
  const lon = parseFloat(url.searchParams.get("lon") || "");
  const days = Math.min(7, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10)));

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "Не указаны координаты" }, { status: 400 });
  }

  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${days}`;
  const cached = getCached<WeatherResponse>(key);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const resp = await fetch(OM_URL(lat, lon, days), {
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json({ error: "Ошибка Open-Meteo: " + resp.status }, { status: 502 });
    }
    const data: WeatherResponse = await resp.json();
    setCached(key, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: "Сеть недоступна: " + (e as Error).message },
      { status: 503 }
    );
  }
}
