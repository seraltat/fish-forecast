// In-memory 10-minute cache for Open-Meteo forecasts keyed by "lat,lon".
// Singleton across hot reloads.
import type { GlobalForCache } from "./types";

const globalForCache = globalThis as unknown as GlobalForCache;

if (!globalForCache.weatherCache) {
  globalForCache.weatherCache = new Map<string, { data: unknown; ts: number }>();
}

export const weatherCache = globalForCache.weatherCache;

export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

const CACHE_VERSION = "v5-moon"; // bump to invalidate stale entries across deploys

export function getCached<T>(key: string): T | null {
  const hit = weatherCache.get(CACHE_VERSION + key);
  if (hit && Date.now() - hit.ts < WEATHER_CACHE_TTL_MS) {
    return hit.data as T;
  }
  return null;
}

export function setCached<T>(key: string, data: T): void {
  weatherCache.set(CACHE_VERSION + key, { data, ts: Date.now() });
}
