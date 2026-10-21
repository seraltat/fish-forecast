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
  type HourInput,
  type PressureTrend,
  type SeasonInfo,
} from "@/lib/forecast";
import { getUserIdFromRequest } from "@/lib/server-user";

// Краснопёрка не рассчитывается в per-spot прогнозе — её ход в реки зависит
// от SST в заливах, не от конкретного места. Отдельный endpoint
// /api/krasnoperka возвращает SST по заливам и статус "идёт/ещё рано".
// В дневнике и настройках краснопёрка остаётся доступной.

// Note: api.open-meteo.com (main weather fetch) is left using global fetch()
// since it has only A (IPv4) records — no IPv6 path to fail on.
// marine-api.open-meteo.com has BOTH A and AAAA records; in some environments
// (Docker, IPv6-broken cloud sandboxes) Node's undici fetch hangs on the AAAA
// lookup until ETIMEDOUT. Using node:https with family:4 forces IPv4-only and
// avoids this. Same fix not needed for the main fetch (no AAAA record).

const OM_URL = (lat: number, lon: number, days: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover,weather_code&daily=sunrise,sunset,moonrise,moonset,moon_phase&timezone=auto&forecast_days=${days}&past_days=3&wind_speed_unit=ms`;

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

  // Retry once on 429 (rate limit) — wait 2 seconds and try again.
  let resp: Response;
  try {
    resp = await fetch(OM_URL(lat, lon, days), { cache: "no-store" });
    if (resp.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      resp = await fetch(OM_URL(lat, lon, days), { cache: "no-store" });
    }
  } catch (e) {
    throw new Error("Сеть недоступна: " + (e as Error).message);
  }
  if (!resp.ok) throw new Error("Open-Meteo " + resp.status);
  const data = (await resp.json()) as WeatherResponse;
  setCached(key, data);
  return data;
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
  const userId = getUserIdFromRequest(req);
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (!body.spotId) {
    return NextResponse.json({ error: "Не указан spotId" }, { status: 400 });
  }

  // Verify the spot belongs to this user before computing the forecast —
  // prevents leaking forecast data for another user's spot.
  const spot = await db.spot.findFirst({ where: { id: body.spotId, userId } });
  if (!spot) {
    return NextResponse.json({ error: "Место не найдено" }, { status: 404 });
  }

  // Краснопёрка — полупроходная рыба. Сезон зависит не от конкретной реки, а
  // от температуры в заливах (Амурский + Уссурийский) — когда SST остывает
  // до 8-10°C, краснопёрка массово идёт в речки и протоки (в любые). Поэтому
  // SST тут глобальный, а не привязан к месту. Сама оценка краснопёрки
  // считается по температуре воды в реке (как у всех), а сезон — по SST.

  // Load FishConfig rows
  const configs = await db.fishConfig.findMany();
  const weightsMap: Record<Species, FishWeights> = { ...DEFAULT_WEIGHTS };
  const enabled: Species[] = [];
  for (const sp of ALL_SPECIES) {
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

  // SST-блок перенесён в отдельный endpoint /api/krasnoperka — краснопёрка
  // не считается в per-spot прогнозе (см. комментарий в начале файла).

  const { hourly, daily } = weather;
  const N = hourly.time.length;

  // Open-Meteo URL uses past_days=3 (for water-temp estimation) and forecast_days=7.
  // past_days=35 was previously used for moonrise history, but lunar day is now computed
  // directly from moon_phase (no moonrise counting needed). Reducing to 3 = 4x less data
  // per API call, helps avoid Open-Meteo 429 rate limiting.
  const PAST_DAYS = 3;
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
      // Краснопёрка не считается в per-spot прогнозе — её ход зависит от SST
      // в заливах, не от конкретного места. Прогноз по краснопёрке доступен
      // отдельной кнопкой во вкладке "Прогноз" (см. /api/krasnoperka).
      if (sp === "краснопёрка") {
        scores[sp] = 0;
        factors[sp] = [];
        seasonStatusMap[sp] = {
          status: "off_season",
          label: "См. вкладку «Прогноз»",
          description: "Прогноз по краснопёрке — нажмите красную иконку рыбы в правом верхнем углу вкладки «Прогноз»",
        };
        continue;
      }
      const input: HourInput = { ...inputHour };
      scores[sp] = scoreForSpecies(sp, weightsMap[sp], input);
      factors[sp] = topFactors(sp, weightsMap[sp], input);
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
    // waterTempSST removed — краснопёрка SST now lives in /api/krasnoperka
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
