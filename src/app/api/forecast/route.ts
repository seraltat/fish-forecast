// POST /api/forecast
// body: {spotId, waterTempOverride?, windDirOverride?, windSpeedOverride?, pressureOverride?, targetSpecies?}
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCached, setCached } from "@/lib/cache";
import type { WeatherResponse, ForecastHour, ForecastResponse } from "@/lib/types";
import { ALL_SPECIES, isSpecies, type Species } from "@/lib/species";
import {
  DEFAULT_WEIGHTS,
  HPA_TO_MMHG,
  computeUserLunarDay,
  estimateWaterTemp,
  getSeasonStatus,
  meanPast3DaysAirTemp,
  moonPhase,
  moonPhaseEmoji,
  moonPhaseLabel,
  pressureTrend,
  scoreForSpecies,
  topFactors,
  weatherCodeLabel,
  windDirLabel,
  type FishWeights,
  type PressureTrend,
  type SeasonInfo,
} from "@/lib/forecast";

const OM_URL = (lat: number, lon: number, days: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover,weather_code&daily=sunrise,sunset,moonrise,moonset,moon_phase&timezone=auto&forecast_days=${days}&past_days=35&wind_speed_unit=ms`;

// Note: moonrise/moonset/moon_phase data comes from the regular Open-Meteo forecast API
// (added to OM_URL as daily params). No separate astronomy API call needed.

interface MoonPair {
  date: string; // "2026-10-11"
  moonrise: string | null; // local ISO string (e.g. "2026-10-11T07:50") or null if absent
  moonset: string | null;
}

// Build moonrise Date[] and pairsByDate map directly from the Open-Meteo weather response.
// No separate fetch — uses daily.moonrise / daily.moonset from the forecast API response.
function extractMoonEventsFromWeather(weather: WeatherResponse): {
  moonrises: Date[];
  pairsByDate: Map<string, MoonPair>;
} {
  const pairsByDate = new Map<string, MoonPair>();
  const moonrises: Date[] = [];
  const daily = weather.daily;
  if (!daily?.moonrise || !daily?.moonset) {
    return { moonrises, pairsByDate };
  }
  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i];
    const mr = daily.moonrise?.[i];
    const ms = daily.moonset?.[i];
    // Open-Meteo returns null when no event that day (e.g. moon doesn't rise on certain days at high latitudes)
    const moonrise = mr ?? null;
    const moonset = ms ?? null;
    pairsByDate.set(date, { date, moonrise, moonset });
    if (moonrise) {
      // Local time string like "2026-10-11T07:48" — treat as UTC for arithmetic
      // (consistent with how forecast hours are constructed elsewhere).
      const iso = moonrise.length === 16 ? moonrise + ":00" : moonrise;
      const d = new Date(iso + "Z");
      if (!isNaN(d.getTime())) moonrises.push(d);
    }
  }
  return { moonrises, pairsByDate };
}

async function fetchWeather(lat: number, lon: number, days = 7): Promise<WeatherResponse> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${days}`;
  const cached = getCached<WeatherResponse>(key);
  if (cached) return cached;
  const resp = await fetch(OM_URL(lat, lon, days), { cache: "no-store" });
  if (!resp.ok) throw new Error("Open-Meteo " + resp.status);
  const data = (await resp.json()) as WeatherResponse;
  setCached(key, data);
  return data;
}

// Open-Meteo Marine API — returns sea surface temperature (SST) for ocean coordinates.
// For land coordinates, returns null. We try the exact coords + 12 nearby offsets
// (5km, 10km, 14km in 4 cardinal + 4 diagonal directions) in parallel and return
// the first non-null SST. For inland spots (250km from any ocean), all offsets return
// null and we correctly return null.
const OM_MARINE_URL = (lat: number, lon: number) =>
  `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=sea_surface_temperature&timezone=auto`;

interface MarineResponse {
  current?: { sea_surface_temperature?: number | null };
  reason?: string;
  error?: boolean;
}

// Cached SST result (1 hour TTL — SST changes slowly, no need to fetch every call).
// Stored in the same global weatherCache map with a different key prefix.
const SST_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchSeaSurfaceTemperature(lat: number, lon: number): Promise<number | null> {
  const cacheKey = `sst-${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = getCached<number>(cacheKey);
  if (cached != null) return cached;

  const offsets: Array<[number, number]> = [
    [0, 0],
    [-0.05, 0], [0.05, 0], [0, -0.05], [0, 0.05],
    [-0.10, 0], [0.10, 0], [0, -0.10], [0, 0.10],
    [-0.10, -0.10], [-0.10, 0.10], [0.10, -0.10], [0.10, 0.10],
  ];

  const promises = offsets.map(async ([dLat, dLon]) => {
    const testLat = Number((lat + dLat).toFixed(4));
    const testLon = Number((lon + dLon).toFixed(4));
    try {
      const r = await fetch(OM_MARINE_URL(testLat, testLon), { cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json()) as MarineResponse;
      if (d.error) return null;
      const sst = d.current?.sea_surface_temperature;
      return sst != null && !Number.isNaN(sst) ? sst : null;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(promises);
  for (const sst of results) {
    if (sst != null) {
      setCached(cacheKey, sst);
      // Override default 10-min TTL for SST — we want 1 hour.
      // Hack: re-set the timestamp directly. The cache uses Date.now() on insert;
      // getCached checks `Date.now() - hit.ts < WEATHER_CACHE_TTL_MS` (10 min).
      // For SST we accept 10-min cache; it's still much better than fetching every call.
      return sst;
    }
  }
  return null;
}

function minutesBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 60000;
}

interface Body {
  spotId: string;
  waterTempOverride?: number | null;
  windDirOverride?: number | null;
  windSpeedOverride?: number | null;
  pressureOverride?: number | null;
  targetSpecies?: Species | null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (!body.spotId) {
    return NextResponse.json({ error: "Не указан spotId" }, { status: 400 });
  }

  const spot = await db.spot.findUnique({ where: { id: body.spotId } });
  if (!spot) {
    return NextResponse.json({ error: "Место не найдено" }, { status: 404 });
  }

  // Краснопёрка — полупроходная рыба. Встречается только в реках Раздольная и Артемовка
  // (и их устьях). Для других мест — не рассчитываем, не показываем в UI.
  const isKrasnoperSpot = spot.name === "Раздольная" || spot.name === "Артемовка";

  // Load FishConfig rows
  const configs = await db.fishConfig.findMany();
  const weightsMap: Record<Species, FishWeights> = { ...DEFAULT_WEIGHTS };
  const enabled: Species[] = [];
  for (const sp of ALL_SPECIES) {
    // Краснопёрка — только для мест Раздольная и Артемовка. Для других мест
    // не рассчитываем оценку и не показываем в UI (chip скрыт, тоггл в Настройках
    // остаётся глобально доступным).
    if (sp === "краснопёрка" && !isKrasnoperSpot) continue;
    const cfg = configs.find((c) => c.species === sp);
    if (cfg) {
      try {
        const parsed = JSON.parse(cfg.weightsJson) as FishWeights;
        weightsMap[sp] = parsed;
      } catch {
        // keep defaults
      }
      if (cfg.enabled) enabled.push(sp);
    } else {
      enabled.push(sp);
    }
  }

  // Fetch weather
  let weather: WeatherResponse;
  try {
    weather = await fetchWeather(spot.latitude, spot.longitude, 7);
  } catch (e) {
    return NextResponse.json(
      { error: "Не удалось получить погоду: " + (e as Error).message },
      { status: 502 }
    );
  }

  // Extract moonrise/moonset/moon_phase from the weather response (now included via OM_URL).
  // Used for Russian-fishing-tradition lunar day calc + UI display.
  const { moonrises, pairsByDate } = extractMoonEventsFromWeather(weather);

  // SST (sea surface temperature) from Marine API — additional info, not replacing
  // the air-temp-based estimate. Used by UI to show real ocean temperature near the spot.
  //
  // SST shown ONLY for spots named "Раздольная" or "Артемовка" (per user request).
  // Кипарисовка is a tributary of Раздольная — SST of Раздольная applies there,
  // no separate SST needed. Other (inland) spots get null — Marine API returns null
  // for land coordinates anyway.
  // The algorithm continues to use the air-temp estimate (waterTempEstimate) — SST is
  // shown for informational purposes only (e.g., user can manually override on
  // Корректировка tab using the SST value if they want to switch the algorithm to use it).
  const sst = isKrasnoperSpot
    ? await fetchSeaSurfaceTemperature(spot.latitude, spot.longitude)
    : null;

  const { hourly, daily } = weather;
  const N = hourly.time.length;

  // Open-Meteo URL uses past_days=35 (for water-temp estimation + moonrise history for lunar day)
  // and forecast_days=7. The hourly array contains 35+7=42 days of hourly data; the daily
  // array contains 42 entries. We need to align the daily astronomy arrays (moonrise, etc.)
  // with the 7-day forecast hours (which start at forecastStartIdx).
  const PAST_DAYS = 35;
  const FORECAST_DAYS = 7;
  const forecastHours = FORECAST_DAYS * 24;
  const forecastStartIdx = Math.max(0, N - forecastHours);
  // For daily arrays: skip the first PAST_DAYS entries to align with forecast hours.
  const sliceFrom = Math.max(0, daily.time.length - FORECAST_DAYS);
  const forecastDaysStartIdx = sliceFrom;

  // Build aligned astronomy arrays parallel to FORECAST daily.time
  // (i.e. skip the past days to match the 168 forecast hours).
  const moonrisesArr: (string | null)[] = daily.time
    .slice(sliceFrom)
    .map((d) => pairsByDate.get(d)?.moonrise ?? null);
  const moonsetsArr: (string | null)[] = daily.time
    .slice(sliceFrom)
    .map((d) => pairsByDate.get(d)?.moonset ?? null);
  // sunrise/sunset are always returned by Open-Meteo (no DNS issues) — pass through directly.
  const sunrisesArr: (string | null)[] = daily.time
    .slice(sliceFrom)
    .map((_, i) => daily.sunrise[sliceFrom + i] ?? null);
  const sunsetsArr: (string | null)[] = daily.time
    .slice(sliceFrom)
    .map((_, i) => daily.sunset[sliceFrom + i] ?? null);

  // Build sunrise/sunset lookup by date string (YYYY-MM-DD)
  const sunriseByDate = new Map<string, Date>();
  const sunsetByDate = new Map<string, Date>();
  for (let i = 0; i < daily.time.length; i++) {
    const day = daily.time[i];
    sunriseByDate.set(day, new Date(daily.sunrise[i] + "Z")); // Open-Meteo returns local time with tz=auto → ISO without tz offset? It returns e.g. "2026-10-11T05:42" — interpret as local to spot. We'll convert manually below.
    sunsetByDate.set(day, new Date(daily.sunset[i] + "Z"));
  }

  // Pre-compute moon phase per day (cached by date).
  // Prefer the accurate moon_phase value from Open-Meteo when available;
  // fall back to the lunar-epoch calculation otherwise.
  const moonByDate = new Map<string, { phase: number; label: string; emoji: string }>();
  for (let i = 0; i < daily.time.length; i++) {
    const day = daily.time[i];
    const apiPhase = daily.moon_phase?.[i];
    const phase = apiPhase != null ? apiPhase : moonPhase(new Date(day + "T12:00:00Z")).phase;
    const label = moonPhaseLabel(phase);
    const emoji = moonPhaseEmoji(phase);
    moonByDate.set(day, { phase, label, emoji });
  }

  // Pressure (mmHg) array
  const pressureMmHgArr = hourly.pressure_msl.map((p) => p * HPA_TO_MMHG);

  // Water temp estimate from past 3 days air temp average + seasonal piecewise formula.
  const avg3 = meanPast3DaysAirTemp(hourly.temperature_2m);
  const waterTempEstimate = estimateWaterTemp(avg3, spot.waterType === "lake" ? "lake" : "river");
  const waterTempOverride =
    body.waterTempOverride != null && !Number.isNaN(body.waterTempOverride)
      ? body.waterTempOverride
      : null;
  const waterTemp = waterTempOverride ?? waterTempEstimate;
  const waterTempSource: "estimate" | "override" = waterTempOverride != null ? "override" : "estimate";

  const hours: ForecastHour[] = [];
  for (let i = forecastStartIdx; i < N; i++) {
    const isoStr = hourly.time[i]; // Open-Meteo local time string, e.g. "2026-10-11T05:00"
    // Treat as local time at the spot. Construct as if UTC for date math (we only need relative comparison + date key).
    const date = new Date(isoStr + ":00Z");
    const dayKey = isoStr.slice(0, 10); // YYYY-MM-DD

    // Sunrise/sunset for this date — parse local-time strings manually
    let sunriseDate = sunriseByDate.get(dayKey);
    let sunsetDate = sunsetByDate.get(dayKey);
    if (!sunriseDate || !sunsetDate) {
      // fallback to the next day's data
      sunriseDate = new Date(dayKey + "T06:00:00Z");
      sunsetDate = new Date(dayKey + "T19:00:00Z");
    }

    // Compute sunrise/sunset as Date for "minutesFromSunEvent" — but since Open-Meteo returns local time strings without TZ,
    // we treat all as naive local same-basis. Compute minute offset within day.
    const minutesOfHour =
      (date.getUTCHours() * 60 + date.getUTCMinutes());
    const sunriseMin =
      sunriseDate.getUTCHours() * 60 + sunriseDate.getUTCMinutes();
    const sunsetMin =
      sunsetDate.getUTCHours() * 60 + sunsetDate.getUTCMinutes();

    // Distance to nearest sunrise/sunset (today or yesterday/tomorrow)
    let nearest = Infinity;
    for (const ref of [sunriseMin, sunsetMin, sunriseMin + 1440, sunsetMin + 1440, sunriseMin - 1440, sunsetMin - 1440]) {
      const d = Math.abs(minutesOfHour - ref);
      if (d < nearest) nearest = d;
    }
    // cap at 720 (12h)
    const minutesFromSunEvent = Math.min(nearest, 720);

    // isNight: hour is before sunrise or after sunset (today)
    const isNight = minutesOfHour < sunriseMin || minutesOfHour > sunsetMin;

    // Pressure trend
    const pNow = pressureMmHgArr[i];
    const p3ago = i - 3 >= 0 ? pressureMmHgArr[i - 3] : pNow;
    const delta = pNow - p3ago;
    const trend: PressureTrend = pressureTrend(delta).trend;
    const trendLabel = pressureTrend(delta).label;

    // Apply overrides
    const windSpeed =
      body.windSpeedOverride != null && !Number.isNaN(body.windSpeedOverride)
        ? body.windSpeedOverride
        : hourly.wind_speed_10m[i];
    const windDir =
      body.windDirOverride != null && !Number.isNaN(body.windDirOverride)
        ? body.windDirOverride
        : hourly.wind_direction_10m[i];
    const pressure =
      body.pressureOverride != null && !Number.isNaN(body.pressureOverride)
        ? body.pressureOverride
        : pNow;
    const airTemp = hourly.temperature_2m[i];
    const cloudCover = hourly.cloud_cover[i];
    const weatherCode = hourly.weather_code[i];
    const precipitation = hourly.precipitation[i];
    const moon = moonByDate.get(dayKey)!;

    const inputHour = {
      airTemp,
      waterTemp,
      windSpeed,
      windDir,
      pressureMmHg: pressure,
      pressureTrend: trend,
      precipitation,
      cloudCover,
      weatherCode,
      minutesFromSunEvent,
      isNight,
      moonPhaseValue: moon.phase,
      lunarDay: computeUserLunarDay(date, moonrises, moon.phase),
      // Local month at the spot (1-12). isoStr is local time (e.g. "2026-10-12T05:00");
      // getUTCMonth on the constructed UTC Date returns the month of that local time string.
      month: new Date(isoStr + ":00Z").getUTCMonth() + 1,
    };

    const scores: Record<Species, number> = {
      карась: 0,
      сазан: 0,
      сом: 0,
      щука: 0,
      краснопёрка: 0,
    };
    const factors: Record<Species, string[]> = {
      карась: [],
      сазан: [],
      сом: [],
      щука: [],
      краснопёрка: [],
    };
    const seasonStatusMap: Record<Species, SeasonInfo> = {
      карась: { status: "active", label: "Активно", description: "" },
      сазан: { status: "active", label: "Активно", description: "" },
      сом: { status: "active", label: "Активно", description: "" },
      щука: { status: "active", label: "Активно", description: "" },
      краснопёрка: { status: "active", label: "Активно", description: "" },
    };
    for (const sp of ALL_SPECIES) {
      // Краснопёрка: не рассчитываем оценку для мест, где её нет.
      // Ставим score=0 и явный статус "Нет в этой реке", чтобы UI показал понятную причину.
      if (sp === "краснопёрка" && !isKrasnoperSpot) {
        scores[sp] = 0;
        factors[sp] = [];
        seasonStatusMap[sp] = {
          status: "off_season",
          label: "Нет в этой реке",
          description: "Краснопёрка водится только в Раздольной и Артемовке",
        };
        continue;
      }
      scores[sp] = scoreForSpecies(sp, weightsMap[sp], inputHour);
      factors[sp] = topFactors(sp, weightsMap[sp], inputHour);
      seasonStatusMap[sp] = getSeasonStatus(sp, inputHour.month, inputHour.waterTemp);
    }

    hours.push({
      time: isoStr,
      airTemp,
      waterTemp,
      windSpeed,
      windDir,
      windDirLabel: windDirLabel(windDir) ?? "—",
      pressure: Math.round(pressure * 10) / 10,
      pressureTrend: Math.round(delta * 10) / 10,
      pressureTrendLabel: trendLabel,
      precipitation,
      cloudCover,
      weatherCode,
      weatherCodeLabel: weatherCodeLabel(weatherCode),
      moonPhase: moon.phase,
      moonPhaseLabel: moon.label,
      moonEmoji: moon.emoji,
      lunarDay: inputHour.lunarDay,
      scores,
      topFactors: factors,
      seasonStatus: seasonStatusMap,
      isNight,
    });
  }

  const resp: ForecastResponse = {
    spotId: body.spotId,
    hours,
    weights: weightsMap,
    enabledSpecies: enabled,
    waterTempEstimate,
    waterTempSource,
    waterTempSST: sst, // null for inland spots; real SST value for coastal spots
    utcOffsetSeconds: (weather as { utc_offset_seconds?: number }).utc_offset_seconds ?? 0,
    moonrises: moonrisesArr,
    moonsets: moonsetsArr,
    sunrises: sunrisesArr,
    sunsets: sunsetsArr,
  };
  return NextResponse.json(resp);
}

// Helper to validate species — used elsewhere
export function validateSpecies(s: unknown): s is Species {
  return isSpecies(s);
}
