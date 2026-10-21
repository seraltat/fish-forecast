// GET /api/krasnoperka
// Returns SST per bay (separately, no averaging) and migration readiness status.
// Краснопёрка migration: when SST in bay cools to 8-12°C, redfins migrate into
// rivers flowing into that bay. SST > 12°C → still in sea (too early).
// SST < 8°C → already in wintering holes.
import { NextResponse } from "next/server";
import https from "node:https";
import { getCached, setCached } from "@/lib/cache";

// Explicit bay coordinates (provided by user) — points actually IN the bay,
// not at river mouths. Marine API uses ~9km grid, snaps to nearest ocean cell.
const BAYS = [
  { name: "Амурский залив",   lat: 43.244764, lon: 131.849619 },
  { name: "Уссурийский залив", lat: 43.239640, lon: 132.277731 },
] as const;

const OM_MARINE_URL = (lat: number, lon: number) =>
  `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=sea_surface_temperature&timezone=auto`;

interface MarineResponse {
  current?: { sea_surface_temperature?: number | null };
  reason?: string;
  error?: boolean;
}

// Fetch SST via node:https with family:4 (IPv4 only). Needed because
// marine-api.open-meteo.com has AAAA records and Node's undici fetch can hang
// on IPv6 in some environments (Docker, IPv6-broken networks).
function fetchSSTAt(lat: number, lon: number): Promise<number | null> {
  const url = OM_MARINE_URL(lat, lon);
  return new Promise<number | null>((resolve) => {
    const req = https.get(url, { family: 4, timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          const d = JSON.parse(data) as MarineResponse;
          if (d.error) { resolve(null); return; }
          const sst = d.current?.sea_surface_temperature;
          resolve(sst != null && !Number.isNaN(sst) ? sst : null);
        } catch {
          resolve(null);
        }
      });
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Migration readiness based on SST. SST is in °C.
// Пороги уточнены по реальной практике: краснопёрка начинает заход в реки
// уже при 11-16°C (по тихой, в устьях и протоках), а не только при 8-10°C.
// Массовый ход — при 7-11°C, далее скатывание на ямы и собственно зимовка.
//   > 16°C → "early"    — ещё в море, ход не начался
//   11-16°C → "starting" — начинается заход, можно ловить в устьях
//   7-11°C → "ready"    — активный массовый ход
//   4-7°C → "fading"    — скатывание на зимовальные ямы
//   < 4°C → "winter"    — на зимовальных ямах
function migrationStatus(sst: number | null): {
  status: "early" | "starting" | "ready" | "fading" | "winter" | "unknown";
  label: string;
  description: string;
} {
  if (sst == null) {
    return {
      status: "unknown",
      label: "Нет данных",
      description: "Не удалось получить SST — проверьте интернет на сервере",
    };
  }
  if (sst > 16) {
    return {
      status: "early",
      label: "Рано",
      description: `Морская вода ${sst}°C — краснопёрка ещё в море, ход не начался`,
    };
  }
  if (sst >= 11) {
    return {
      status: "starting",
      label: "Начинается заход",
      description: `Морская вода ${sst}°C — краснопёрка начинает заход в реки. Можно ловить в устьях и протоках`,
    };
  }
  if (sst >= 7) {
    return {
      status: "ready",
      label: "Активный ход!",
      description: `Морская вода остыла до ${sst}°C — краснопёрка массово заходит в реки. Лучшее время!`,
    };
  }
  if (sst >= 4) {
    return {
      status: "fading",
      label: "Скаты на ямы",
      description: `Морская вода ${sst}°C — краснопёрка заходит на зимовальные ямы в реках`,
    };
  }
  return {
    status: "winter",
    label: "На зимовальных ямах",
    description: `Морская вода ${sst}°C — краснопёрка залегла в зимовальные ямы в реках`,
  };
}

export async function GET() {
  // Cache per-bay (separately, since each is fetched independently).
  const bays = await Promise.all(
    BAYS.map(async (bay) => {
      const cacheKey = `krasnoperka-${bay.name}`;
      const cached = getCached<number>(cacheKey);
      const sst = cached ?? await fetchSSTAt(bay.lat, bay.lon);
      if (cached == null && sst != null) setCached(cacheKey, sst);
      const status = migrationStatus(sst);
      return {
        name: bay.name,
        latitude: bay.lat,
        longitude: bay.lon,
        sst,
        status: status.status,
        label: status.label,
        description: status.description,
      };
    })
  );

  // Overall status precedence: ready > starting > fading > winter > early > unknown
  // (если любой залив в "ready" — глобально "ready", даже если другой залив "early")
  const STATUS_PRIORITY: Record<string, number> = {
    ready: 4, starting: 3, fading: 2, winter: 1, early: 0, unknown: -1,
  };
  const statuses = bays.map((b) => b.status);
  let overall: "early" | "starting" | "ready" | "fading" | "winter" | "unknown";
  if (statuses.every((s) => s === "unknown")) overall = "unknown";
  else {
    overall = statuses.reduce((max, s) =>
      (STATUS_PRIORITY[s] ?? -1) > (STATUS_PRIORITY[max] ?? -1) ? s : max,
    statuses[0] as typeof overall);
  }

  const overallLabels: Record<typeof overall, string> = {
    early: "Рано — краснопёрка ещё в море",
    starting: "Начинается заход в реки",
    ready: "Активный ход — краснопёрка идёт в реки!",
    fading: "Скаты на зимовальные ямы",
    winter: "На зимовальных ямах",
    unknown: "Нет данных о SST",
  };

  return NextResponse.json({
    bays,
    overall,
    overallLabel: overallLabels[overall],
    fetchedAt: new Date().toISOString(),
  });
}
