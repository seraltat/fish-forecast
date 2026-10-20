import type { Species } from "./species";
import type { FishWeights, SeasonInfo } from "./forecast";

export interface GlobalForCache {
  weatherCache?: Map<string, { data: unknown; ts: number }>;
}

export interface WeatherHourly {
  time: string[]; // ISO strings
  temperature_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  pressure_msl: number[];
  precipitation: number[];
  cloud_cover: number[];
  weather_code: number[];
}

export interface WeatherDaily {
  time: string[];
  sunrise: string[];
  sunset: string[];
  moonrise?: (string | null)[];  // Open-Meteo returns null when no moonrise that day
  moonset?: (string | null)[];
  moon_phase?: (number | null)[];  // 0..1 fraction
}

export interface WeatherResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  hourly: WeatherHourly;
  daily: WeatherDaily;
  hourly_units: Record<string, string>;
  daily_units: Record<string, string>;
}

export interface ForecastHour {
  time: string; // ISO
  airTemp: number;
  waterTemp: number;
  windSpeed: number;
  windDir: number;
  windDirLabel: string;
  pressure: number; // mmHg
  pressureTrend: number; // delta in mmHg vs 3h ago
  pressureTrendLabel: string;
  precipitation: number;
  cloudCover: number;
  weatherCode: number;
  weatherCodeLabel: string;
  moonPhase: number; // 0..1 (astronomical, for emoji)
  moonPhaseLabel: string;
  moonEmoji: string;
  lunarDay: number; // 1..30 (Russian fishing tradition, by moonrise at spot coords)
  scores: Record<Species, number>;
  topFactors: Record<Species, string[]>;
  seasonStatus: Record<Species, SeasonInfo>;
  isNight: boolean;
}

export interface ForecastResponse {
  spotId: string;
  hours: ForecastHour[];
  weights: Record<Species, FishWeights>;
  enabledSpecies: Species[];
  waterTempEstimate: number;
  waterTempSource: "estimate" | "override";
  // waterTempSST removed — краснопёрка SST now lives in /api/krasnoperka
  utcOffsetSeconds: number; // spot's UTC offset (e.g. 36000 for UTC+10) — for client-side "now" calc
  // Astronomy data — moonrise/moonset/sunrise/sunset per day (parallel to daily.time).
  // Null entries when API unreachable or event doesn't occur that day.
  moonrises: (string | null)[]; // local ISO strings (e.g. "2026-10-12T07:50") aligned with daily.time
  moonsets: (string | null)[];
  sunrises: (string | null)[];
  sunsets: (string | null)[];
}
