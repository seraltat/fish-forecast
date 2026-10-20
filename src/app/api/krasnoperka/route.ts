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
// > 12°C → "early" — redfins still in sea, not migrating yet
// 8-12°C → "ready" — autumn migration in progress, redfins entering rivers
// < 8°C  → "winter" — redfins already in wintering holes in rivers
function migrationStatus(sst: number | null): {
  status: "early" | "ready" | "winter" | "unknown";
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
  if (sst > 12) {
    return {
      status: "early",
      label: "Рано",
      description: `Морская вода ${sst}°C — слишком тёплая. Краснопёрка ещё в море`,
    };
  }
  if (sst >= 8) {
    return {
      status: "ready",
      label: "Готова идти!",
      description: `Морская вода остыла до ${sst}°C — краснопёрка массово заходит в реки и протоки`,
    };
  }
  return {
    status: "winter",
    label: "На зимовальных ямах",
    description: `Морская вода ${sst}°C — краснопёрка уже залегла в зимовальные ямы в реках`,
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

  // Overall status: ready if ANY bay is ready (redfins can be in rivers flowing into that bay).
  // winter takes precedence over ready (if any bay shows winter, that's the global state).
  // unknown if all are unknown.
  const statuses = bays.map((b) => b.status);
  let overall: "early" | "ready" | "winter" | "unknown";
  if (statuses.every((s) => s === "unknown")) overall = "unknown";
  else if (statuses.includes("winter")) overall = "winter";
  else if (statuses.includes("ready")) overall = "ready";
  else overall = "early";

  const overallLabels: Record<typeof overall, string> = {
    early: "Рано — краснопёрка ещё в море",
    ready: "Готова идти в реки!",
    winter: "Уже на зимовальных ямах",
    unknown: "Нет данных о SST",
  };

  return NextResponse.json({
    bays,
    overall,
    overallLabel: overallLabels[overall],
    fetchedAt: new Date().toISOString(),
  });
}
